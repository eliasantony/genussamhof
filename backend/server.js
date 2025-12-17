const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { sql } = require('@vercel/postgres');
const { put } = require('@vercel/blob');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// API: Get Products
app.get('/api/products', async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM produkte`;
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API: Get Customer by ID
app.get('/api/customer/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { rows } = await sql`SELECT * FROM kunden WHERE kunden_id = ${id}`;
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ADMIN API ---

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.ADMIN_PASSWORD) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

app.get('/api/admin/customers', adminAuth, async (req, res) => {
    try {
        const { rows } = await sql`SELECT * FROM kunden ORDER BY erstellt_am DESC`;
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/inquiries', adminAuth, async (req, res) => {
    try {
        const { rows } = await sql`
            SELECT a.*, k.firma_name, k.kontakt_vorname, k.kontakt_familienname 
            FROM anfragen a
            LEFT JOIN kunden k ON a.kunden_id = k.kunden_id
            ORDER BY a.erstellt_am DESC
        `;
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/inquiry/:id/positions', adminAuth, async (req, res) => {
    try {
        const { rows } = await sql`
            SELECT ap.*, p.name 
            FROM anfrage_produkt ap
            LEFT JOIN produkte p ON ap.produkt_id = p.produkt_id
            WHERE ap.anfrage_id = ${req.params.id}
            ORDER BY ap.sortierung ASC
        `;
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/admin/customer/:id', adminAuth, async (req, res) => {
    const d = req.body;
    const id = req.params.id;
    try {
        await sql`
            UPDATE kunden SET 
            firma_name = ${d.firma_name}, rolle = ${d.rolle},
            kontakt_anrede = ${d.kontakt_anrede}, kontakt_titel = ${d.kontakt_titel}, kontakt_vorname = ${d.kontakt_vorname}, kontakt_familienname = ${d.kontakt_familienname}, email = ${d.email}, telefon = ${d.telefon},
            adresse = ${d.adresse}, stadt = ${d.stadt}, plz = ${d.plz}, land = ${d.land}, rechnungsadresse = ${d.rechnungsadresse},
            hauptverantwortlicher_anrede = ${d.hauptverantwortlicher_anrede}, hauptverantwortlicher_titel = ${d.hauptverantwortlicher_titel}, hauptverantwortlicher_vorname = ${d.hauptverantwortlicher_vorname}, hauptverantwortlicher_familienname = ${d.hauptverantwortlicher_familienname}, hauptverantwortlicher_telefon = ${d.hauptverantwortlicher_telefon}, hauptverantwortlicher_email = ${d.hauptverantwortlicher_email},
            sprache = ${d.sprache}, notizen = ${d.notizen}, zustimmung_marketing = ${d.zustimmung_marketing}, quelle = ${d.quelle}, material_gesendet = ${d.material_gesendet}
            WHERE kunden_id = ${id}
        `;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- END ADMIN API ---

// API: Create Offer
app.post('/api/offer', async (req, res) => {
    const data = req.body;

    const createInquiry = async (customerId) => {
        try {
            const inquiryId = 'I' + Date.now();
            const createdDate = new Date().toISOString().split('T')[0];

            // 1. Save Inquiry
            await sql`
                INSERT INTO anfragen (anfrage_id, kunden_id, start_datum, num_teilnehmer, status, budget_eur, erstellt_am)
                VALUES (${inquiryId}, ${customerId}, ${data.date}, ${data.participants}, 'Pending', ${data.total}, ${createdDate})
            `;

            // 2. Save Positions
            const positions = [];
            let sortOrder = 1;

            const addPos = async (prodId, qty, price) => {
                if (!prodId) return;
                const posId = 'IP' + Date.now() + Math.random().toString(36).substr(2, 5);
                const total = qty * price;
                await sql`
                    INSERT INTO anfrage_produkt (anfrage_produkt_id, anfrage_id, produkt_id, menge, einzelpreis, total_eur, sortierung)
                    VALUES (${posId}, ${inquiryId}, ${prodId}, ${qty}, ${price}, ${total}, ${sortOrder++})
                `;
                positions.push({ id: prodId, qty, price, total });
            };

            // Map data
            if (data.package === 'full') await addPos('PROD-SEMINAR-FULL', data.participants, 68);
            if (data.package === 'half') await addPos('PROD-SEMINAR-HALF', data.participants, 49);
            if (data.room?.active) await addPos('PROD-ROOM-DBL-SINGLE', data.room.count, 103);
            if (data.dinner?.active) await addPos('PROD-DINNER-3C', data.dinner.count, 39);
            if (data.extras?.sandwiches) await addPos('PROD-EXTRA-BROETCHEN', data.participants, 7);
            if (data.extras?.salad) await addPos('PROD-EXTRA-SALATBUFFET', data.participants, 15);
            if (data.extras?.wine) await addPos('PROD-EXTRA-WEINBEGLEITUNG', data.dinner.count, 22);
            if (data.activities?.cookingClass) await addPos('PROD-ACTIVITY-KOCHKURS', data.participants, 89);
            if (data.activities?.kitchenRental) await addPos('PROD-ACTIVITY-KUECHE', data.participants, 39);

            // 3. Generate Document (Blob Upload)
            const resultPromise = generateWordDocument(inquiryId, customerId, data, positions);
            const result = await resultPromise; // Wait for upload

            res.json(result);

        } catch (err) {
            console.error(err);
            res.status(500).json({ error: err.message });
        }
    };

    // Handle New Customer
    if (!data.customer_id && data.new_customer) {
        const newId = 'C' + Date.now();
        const nc = data.new_customer;
        const today = new Date().toISOString().split('T')[0];

        try {
            await sql`
                INSERT INTO kunden (kunden_id, firma_name, kontakt_vorname, kontakt_familienname, email, telefon, adresse, stadt, plz, land, sprache, erstellt_am)
                VALUES (${newId}, ${nc.company || ''}, ${nc.firstname}, ${nc.lastname}, ${nc.email}, ${nc.phone || ''}, ${nc.address || ''}, ${nc.city || ''}, ${nc.zip || ''}, ${nc.country || ''}, 'DE', ${today})
            `;
            await createInquiry(newId);
        } catch (err) {
            res.status(500).json({ error: "Failed to create customer: " + err.message });
        }
    } else {
        const custId = data.customer_id || 'C00001';
        await createInquiry(custId);
    }
});

async function generateWordDocument(inquiryId, customerId, data, positions) {
    try {
        const { rows } = await sql`SELECT * FROM kunden WHERE kunden_id = ${customerId}`;
        let customer = rows[0];
        if (!customer) customer = { firma_name: "Unbekannt", kontakt_nachname: "Kunde" };

        const templatePath = path.resolve(__dirname, '../word_Vorlagen/Firmenvereinabrung_ Exlusivangebot.docx');
        if (!fs.existsSync(templatePath)) {
            return { success: true, inquiryId, message: "Template not found" };
        }

        const content = fs.readFileSync(templatePath, 'binary');
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const templateData = {
            firma_name: customer.firma_name || 'Musterfirma',
            ansprechpartner: `${customer.kontakt_anrede || ''} ${customer.kontakt_vorname} ${customer.kontakt_familienname}`,
            datum: new Date().toLocaleDateString('de-DE'),
            anfrage_datum: new Date(data.date).toLocaleDateString('de-DE'),
            teilnehmer: data.participants,
            positions: positions.map(p => ({
                name: p.id,
                brutto_preis: p.price.toFixed(2).replace('.', ','),
                menge: p.qty,
                gesamt: p.total.toFixed(2).replace('.', ',')
            })),
            total_summe: data.total.replace('.', ',')
        };

        doc.render(templateData);

        const buf = doc.getZip().generate({ type: 'nodebuffer' });
        const filename = `Angebot_${inquiryId}_${(customer.firma_name || 'Kunde').replace(/ /g, '_')}.docx`;

        // Upload to Vercel Blob
        const blob = await put(filename, buf, { access: 'public' });

        // Update DB with URL
        const createdDate = new Date().toISOString();
        const url = blob.url;
        await sql`
            UPDATE anfragen SET angebot_dateiname = ${filename}, angebot_url = ${url}, angebot_erstellt_am = ${createdDate} 
            WHERE anfrage_id = ${inquiryId}
        `;

        console.log("Document uploaded to: " + url);
        return { success: true, inquiryId, file: url };

    } catch (e) {
        console.error("Doc gen error", e);
        return { success: true, inquiryId, message: "Offer saved but doc gen failed" };
    }
}

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

module.exports = app;
