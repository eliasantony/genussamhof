const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const db = require('./database');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Admin Auth Middleware
const adminAuth = (req, res, next) => {
    const pwd = req.headers['x-admin-password'];
    if (pwd === process.env.ADMIN_PASSWORD) {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/offers', express.static(path.join(__dirname, '../generated_offers')));

// Database Migration (ensure column exists)
db.serialize(() => {
    db.run("ALTER TABLE anfragen ADD COLUMN angebot_dateiname TEXT", [], (err) => {
        // Ignore error if column already exists
    });
});

app.use('/offers', express.static(path.join(__dirname, '../generated_offers')));

// Database Migration (ensure columns exist)
const newColumns = [
    "angebo_dateiname TEXT", // typo fix if needed, but existing was angebot_dateiname
    "rolle TEXT",
    "kontakt_anrede TEXT",
    "kontakt_titel TEXT",
    "hauptverantwortlicher_anrede TEXT",
    "hauptverantwortlicher_titel TEXT",
    "hauptverantwortlicher_vorname TEXT",
    "hauptverantwortlicher_familienname TEXT",
    "hauptverantwortlicher_telefon TEXT",
    "hauptverantwortlicher_email TEXT",
    "rechnungsadresse TEXT",
    "sprache TEXT",
    "notizen TEXT",
    "zustimmung_marketing TEXT", // 'true'/'false'
    "quelle TEXT",
    "material_gesendet TEXT" // 'true'/'false'
];

db.serialize(() => {
    // Existing column Check
    db.run("ALTER TABLE anfragen ADD COLUMN angebot_dateiname TEXT", [], (err) => { });

    // Add new customer columns
    newColumns.forEach(col => {
        const colName = col.split(' ')[0];
        db.run(`ALTER TABLE kunden ADD COLUMN ${col}`, [], (err) => {
            // Ignore error if column already exists
        });
    });
});


// API: Get Products (to ensure frontend has latest prices)
app.get('/api/products', (req, res) => {
    db.all("SELECT * FROM produkte", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// API: Get Customer by ID
app.get('/api/customer/:id', (req, res) => {
    const id = req.params.id;
    db.get("SELECT * FROM kunden WHERE kunden_id = ?", [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(row);
    });
});

// --- ADMIN API ---

app.post('/api/admin/login', (req, res) => {
    // Simple check, frontend will send password in body to verify, 
    // but actual requests use header. 
    // This endpoint is just for the UI to "know" it's correct before switching view.
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/admin/customers', adminAuth, (req, res) => {
    db.all("SELECT * FROM kunden ORDER BY erstellt_am DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/inquiries', adminAuth, (req, res) => {
    const sql = `
        SELECT a.*, k.firma_name, k.kontakt_vorname, k.kontakt_familienname 
        FROM anfragen a
        LEFT JOIN kunden k ON a.kunden_id = k.kunden_id
        ORDER BY a.erstellt_am DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/admin/inquiry/:id/positions', adminAuth, (req, res) => {
    const sql = `
        SELECT ap.*, p.name 
        FROM anfrage_produkt ap
        LEFT JOIN produkte p ON ap.produkt_id = p.produkt_id
        WHERE ap.anfrage_id = ?
        ORDER BY ap.sortierung ASC
    `;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Update Customer
app.put('/api/admin/customer/:id', adminAuth, (req, res) => {
    const {
        firma_name, rolle,
        kontakt_anrede, kontakt_titel, kontakt_vorname, kontakt_familienname, email, telefon,
        adresse, stadt, plz, land, rechnungsadresse,
        hauptverantwortlicher_anrede, hauptverantwortlicher_titel, hauptverantwortlicher_vorname, hauptverantwortlicher_familienname, hauptverantwortlicher_telefon, hauptverantwortlicher_email,
        sprache, notizen, zustimmung_marketing, quelle, material_gesendet
    } = req.body;

    db.run(`UPDATE kunden SET 
            firma_name = ?, rolle = ?,
            kontakt_anrede = ?, kontakt_titel = ?, kontakt_vorname = ?, kontakt_familienname = ?, email = ?, telefon = ?,
            adresse = ?, stadt = ?, plz = ?, land = ?, rechnungsadresse = ?,
            hauptverantwortlicher_anrede = ?, hauptverantwortlicher_titel = ?, hauptverantwortlicher_vorname = ?, hauptverantwortlicher_familienname = ?, hauptverantwortlicher_telefon = ?, hauptverantwortlicher_email = ?,
            sprache = ?, notizen = ?, zustimmung_marketing = ?, quelle = ?, material_gesendet = ?
            WHERE kunden_id = ?`,
        [
            firma_name, rolle,
            kontakt_anrede, kontakt_titel, kontakt_vorname, kontakt_familienname, email, telefon,
            adresse, stadt, plz, land, rechnungsadresse,
            hauptverantwortlicher_anrede, hauptverantwortlicher_titel, hauptverantwortlicher_vorname, hauptverantwortlicher_familienname, hauptverantwortlicher_telefon, hauptverantwortlicher_email,
            sprache, notizen, zustimmung_marketing, quelle, material_gesendet,
            req.params.id
        ],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

// --- END ADMIN API ---

// API: Create Offer
app.post('/api/offer', (req, res) => {
    const data = req.body;

    // Helper to proceed with inquiry creation once we have a customer ID
    const createInquiry = (customerId, customerName) => {
        const inquiryId = 'I' + Date.now();
        const createdDate = new Date().toISOString().split('T')[0];

        // 1. Save Inquiry
        const stmt = db.prepare(`INSERT INTO anfragen (
            anfrage_id, kunden_id, start_datum, num_teilnehmer, status, budget_eur, erstellt_am
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);

        stmt.run(inquiryId, customerId, data.date, data.participants, 'Pending', data.total, createdDate, function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // 2. Save Inquiry Positions
            const positions = [];
            let sortOrder = 1;

            const addPos = (prodId, qty, price) => {
                if (!prodId) return;
                const posId = 'IP' + Date.now() + sortOrder;
                const total = qty * price;
                db.run(`INSERT INTO anfrage_produkt (anfrage_produkt_id, anfrage_id, produkt_id, menge, einzelpreis, total_eur, sortierung) 
                        VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [posId, inquiryId, prodId, qty, price, total, sortOrder++]);

                positions.push({ id: prodId, qty, price, total });
            };

            // Map frontend data to DB products
            if (data.package === 'full') addPos('PROD-SEMINAR-FULL', data.participants, 68);
            if (data.package === 'half') addPos('PROD-SEMINAR-HALF', data.participants, 49);
            if (data.room?.active) addPos('PROD-ROOM-DBL-SINGLE', data.room.count, 103);
            if (data.dinner?.active) addPos('PROD-DINNER-3C', data.dinner.count, 39);
            if (data.extras?.sandwiches) addPos('PROD-EXTRA-BROETCHEN', data.participants, 7);
            if (data.extras?.salad) addPos('PROD-EXTRA-SALATBUFFET', data.participants, 15);
            if (data.extras?.wine) addPos('PROD-EXTRA-WEINBEGLEITUNG', data.dinner.count, 22);
            if (data.activities?.cookingClass) addPos('PROD-ACTIVITY-KOCHKURS', data.participants, 89);
            if (data.activities?.kitchenRental) addPos('PROD-ACTIVITY-KUECHE', data.participants, 39);

            // 3. Generate Document
            try {
                generateWordDocument(inquiryId, customerId, data, positions, res);
            } catch (docErr) {
                console.error("Doc gen error", docErr);
                res.json({ success: true, message: "Offer saved but document generation failed.", inquiryId });
            }
        });
    };

    // Check if new customer logic is needed
    if (!data.customer_id && data.new_customer) {
        const newId = 'C' + Date.now();
        const nc = data.new_customer;

        // Insert new customer
        const stmtCust = db.prepare(`INSERT INTO kunden (
            kunden_id, firma_name, kontakt_vorname, kontakt_familienname, email, telefon, erstellt_am
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`);

        const today = new Date().toISOString().split('T')[0];

        stmtCust.run(newId, nc.company || '', nc.firstname, nc.lastname, nc.email, nc.phone || '', today, (err) => {
            if (err) {
                return res.status(500).json({ error: "Failed to create customer: " + err.message });
            }
            // Proceed with new ID
            createInquiry(newId, `${nc.firstname} ${nc.lastname}`);
        });
    } else {
        // Existing customer flow (fallback to C00001 if mostly testing)
        const custId = data.customer_id || 'C00001';
        createInquiry(custId, 'Existing Customer');
    }
});

function generateWordDocument(inquiryId, customerId, data, positions, res) {
    // Load Customer
    db.get("SELECT * FROM kunden WHERE kunden_id = ?", [customerId], (err, customer) => {
        if (err || !customer) {
            console.warn("Customer not found for doc gen");
            customer = { firma_name: "Unbekannt", kontakt_nachname: "Kunde" };
        }

        // Load Template
        const templatePath = path.resolve(__dirname, '../word_Vorlagen/Firmenvereinabrung_ Exlusivangebot.docx');
        // Fallback to simple file check because exact name might vary or be missing in exact path
        if (!fs.existsSync(templatePath)) {
            console.error("Template not found at " + templatePath);
            return res.json({ success: true, inquiryId, message: "Template not found" });
        }

        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
            paragraphLoop: true,
            linebreaks: true,
        });

        // Prepare Data for Template
        const templateData = {
            firma_name: customer.firma_name || 'Musterfirma',
            ansprechpartner: `${customer.kontakt_anrede} ${customer.kontakt_vorname} ${customer.kontakt_familienname}`,
            datum: new Date().toLocaleDateString('de-DE'),
            anfrage_datum: new Date(data.date).toLocaleDateString('de-DE'),
            teilnehmer: data.participants,

            // Dynamic Lists
            positions: positions.map(p => ({
                name: p.id, // In real app, join with product name
                brutto_preis: p.price.toFixed(2).replace('.', ','),
                menge: p.qty,
                gesamt: p.total.toFixed(2).replace('.', ',')
            })),

            total_summe: data.total.replace('.', ',')
        };

        doc.render(templateData);

        const buf = doc.getZip().generate({ type: 'nodebuffer' });
        const filename = `Angebot_${inquiryId}_${customer.firma_name.replace(/ /g, '_')}.docx`;
        const outputPath = path.resolve(__dirname, '../generated_offers', filename);

        fs.writeFileSync(outputPath, buf);

        console.log("Document generated: " + outputPath);

        // Update DB with filename
        db.run("UPDATE anfragen SET angebot_dateiname = ?, angebot_erstellt_am = ? WHERE anfrage_id = ?",
            [filename, new Date().toISOString(), inquiryId]);

        res.json({ success: true, inquiryId, file: filename });
    });
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
