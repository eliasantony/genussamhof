const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'seminar.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

function setup() {
    db.serialize(() => {
        // 1. Customers (Kunden)
        db.run(`CREATE TABLE IF NOT EXISTS kunden (
            kunden_id TEXT PRIMARY KEY,
            firma_name TEXT,
            rolle TEXT,
            kontakt_anrede TEXT,
            kontakt_titel TEXT,
            kontakt_vorname TEXT,
            kontakt_familienname TEXT,
            telefon TEXT,
            email TEXT,
            adresse TEXT,
            stadt TEXT,
            plz TEXT,
            land TEXT,
            hauptverantwortlicher_anrede TEXT,
            hauptverantwortlicher_titel TEXT,
            hauptverantwortlicher_vorname TEXT,
            hauptverantwortlicher_familienname TEXT,
            hauptverantwortlicher_telefon TEXT,
            hauptverantwortlicher_email TEXT,
            rechnungsadresse TEXT,
            sprache TEXT,
            notizen TEXT,
            zustimmung_marketing TEXT,
            quelle TEXT,
            material_gesendet TEXT,
            erstellt_am TEXT
        )`);

        // 2. Products (Produkte)
        db.run(`CREATE TABLE IF NOT EXISTS produkte (
            produkt_id TEXT PRIMARY KEY,
            name TEXT,
            kategorie TEXT,
            beschreibung TEXT,
            preis_typ TEXT,
            preis_eur REAL,
            steuer_rate REAL
        )`);

        // 3. Inquiries (Anfragen)
        db.run(`CREATE TABLE IF NOT EXISTS anfragen (
            anfrage_id TEXT PRIMARY KEY,
            kunden_id TEXT,
            event_name TEXT,
            start_datum TEXT,
            end_datum TEXT,
            num_teilnehmer INTEGER,
            veranstaltungsart TEXT,
            veranstaltungsort TEXT,
            bestuhlung TEXT,
            zimmerreservierung BOOLEAN,
            status TEXT,
            budget_eur REAL,
            gueltig_bis TEXT,
            angebot_nummer TEXT,
            angebot_erstellt_am TEXT,
            angebot_versendet_am TEXT,
            angebot_status TEXT,
            vertragspartner TEXT,
            rechnungs_empfaenger TEXT,
            notizen TEXT,
            erstellt_am TEXT,
            FOREIGN KEY(kunden_id) REFERENCES kunden(kunden_id)
        )`);

        // 4. Inquiry Positions (Anfrage Produkte)
        db.run(`CREATE TABLE IF NOT EXISTS anfrage_produkt (
            anfrage_produkt_id TEXT PRIMARY KEY,
            anfrage_id TEXT,
            produkt_id TEXT,
            menge REAL,
            einzelpreis REAL,
            nachlass_pct REAL,
            total_eur REAL,
            datum TEXT,
            sortierung INTEGER,
            anzeigetext TEXT,
            notizen TEXT,
            FOREIGN KEY(anfrage_id) REFERENCES anfragen(anfrage_id),
            FOREIGN KEY(produkt_id) REFERENCES produkte(produkt_id)
        )`);
    });
}

function seed() {
    db.serialize(() => {
        // Clear existing for idempotency
        db.run("DELETE FROM kunden");
        db.run("DELETE FROM produkte");
        
        // Seed Kunde
        const stmtKunde = db.prepare(`INSERT INTO kunden VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        stmtKunde.run(
            'C00001', 'Musterfirma', 'Assistant', 'Herr', 'BSc.', 'Max', 'Muster', '4366012345678', 'max.muster@mail.com', 
            'Rennweg 73', 'Wien', '1030', 'Österreich', 'Herr', 'Dipl Ing.', 'John', 'Doe', '43660987654321', 
            'john.doe@gmail.com', 'Stephansplatz 1/3, 1010 Wien', 'DE', '', 'Yes', '', '', '05.11.2025'
        );
        stmtKunde.finalize();

        // Seed Produkte
        const products = [
            ['PROD-ROOM-DBL-SINGLE', 'Nächtigung im Doppelzimmer zur Einzelbenützung mit Frühstück', 'Unterkunft', '1 Übernachtung im Doppelzimmer zur Einzelbenützung inkl. Frühstück', 'pro_person_pro_nacht', 103, 0.1],
            ['PROD-SEMINAR-FULL', 'Seminarpauschale ganztags exkl. Getränke (inkl. Pausen)', 'Seminar', 'Ganztägige Seminarpauschale ohne Getränke, inkl. Pausenverpflegung', 'pro_person_pro_tag', 68, 0.1],
            ['PROD-SEMINAR-HALF', 'Seminarpauschale halbtags exkl. Getränke (inkl. Pausen)', 'Seminar', 'Halbtägige Seminarpauschale ohne Getränke, inkl. Pausenverpflegung', 'pro_person_pro_tag', 49, 0.1],
            ['PROD-DINNER-3C', 'Abendessen (3 Gänge exkl. Getränke) inkl. Grander-Wasser', 'Catering', '3-Gänge-Abendessen ohne Getränke, inkl. Grander-Wasser', 'pro_person_pro_mahl', 39, 0.1],
            ['PROD-EXTRA-BROETCHEN', 'Belegte Brötchen (3 Stück)', 'Extra', 'Kleine Jause mit drei belegten Brötchen', 'pro_person', 7, 0.1],
            ['PROD-EXTRA-SALATBUFFET', 'Salatbuffet', 'Extra', 'Frisches Salatbuffet als Zusatzoption', 'pro_person', 15, 0.1],
            ['PROD-EXTRA-WEINBEGLEITUNG', 'Weinbegleitung zum 3-gängigen Abendessen (3 Weine)', 'Extra', 'Passende Weinbegleitung (3 Gläser) zu 3-Gänge-Abendessen', 'pro_person', 22, 0.1],
            ['PROD-ACTIVITY-KOCHKURS', 'Kochkurs 3 Gänge (für Gruppen von 7–10 Personen)', 'Aktivität', 'Geführter 3-Gänge-Kochkurs für Gruppen zwischen 7 und 10 Personen', 'pro_person', 89, 0.1],
            ['PROD-ACTIVITY-KUECHE', 'Kochschule zur Eigennutzung', 'Aktivität', 'Nutzung der Kochschule für eigene Zwecke', 'pro_stunde', 39, 0.1]
        ];

        const stmtProd = db.prepare(`INSERT INTO produkte VALUES (?,?,?,?,?,?,?)`);
        products.forEach(p => stmtProd.run(p));
        stmtProd.finalize();
        
        console.log("Database seeded successfully.");
    });
}

// Check if running as script
if (require.main === module) {
    setup();
    seed();
    // Close is handled by process exit usually, but good to be explicit in scripts
    // db.close(); 
}

module.exports = db;
