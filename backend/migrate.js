require('dotenv').config();
const { sql } = require('@vercel/postgres');

async function migrate() {
    try {
        console.log("Starting migration...");

        // 1. Customers
        await sql`CREATE TABLE IF NOT EXISTS kunden (
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
        )`;
        console.log("Table 'kunden' checked.");

        // 2. Products
        await sql`CREATE TABLE IF NOT EXISTS produkte (
            produkt_id TEXT PRIMARY KEY,
            name TEXT,
            kategorie TEXT,
            beschreibung TEXT,
            preis_typ TEXT,
            preis_eur NUMERIC,
            steuer_rate NUMERIC
        )`;
        console.log("Table 'produkte' checked.");

        // 3. Inquiries
        await sql`CREATE TABLE IF NOT EXISTS anfragen (
            anfrage_id TEXT PRIMARY KEY,
            kunden_id TEXT REFERENCES kunden(kunden_id),
            event_name TEXT,
            start_datum TEXT,
            end_datum TEXT,
            num_teilnehmer INTEGER,
            veranstaltungsart TEXT,
            veranstaltungsort TEXT,
            bestuhlung TEXT,
            zimmerreservierung BOOLEAN,
            status TEXT,
            budget_eur NUMERIC,
            gueltig_bis TEXT,
            angebot_nummer TEXT,
            angebot_erstellt_am TEXT,
            angebot_versendet_am TEXT,
            angebot_status TEXT,
            vertragspartner TEXT,
            rechnungs_empfaenger TEXT,
            notizen TEXT,
            erstellt_am TEXT,
            angebot_dateiname TEXT,
            angebot_url TEXT
        )`;
        console.log("Table 'anfragen' checked. Added angebot_url.");

        // 4. Inquiry Products
        await sql`CREATE TABLE IF NOT EXISTS anfrage_produkt (
            anfrage_produkt_id TEXT PRIMARY KEY,
            anfrage_id TEXT REFERENCES anfragen(anfrage_id),
            produkt_id TEXT REFERENCES produkte(produkt_id),
            menge NUMERIC,
            einzelpreis NUMERIC,
            nachlass_pct NUMERIC,
            total_eur NUMERIC,
            datum TEXT,
            sortierung INTEGER,
            anzeigetext TEXT,
            notizen TEXT
        )`;
        console.log("Table 'anfrage_produkt' checked.");

        // SEED DATA

        // Products
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

        for (const p of products) {
            // Upsert (do nothing if exists)
            await sql`
                INSERT INTO produkte (produkt_id, name, kategorie, beschreibung, preis_typ, preis_eur, steuer_rate)
                VALUES (${p[0]}, ${p[1]}, ${p[2]}, ${p[3]}, ${p[4]}, ${p[5]}, ${p[6]})
                ON CONFLICT (produkt_id) DO UPDATE SET 
                name = EXCLUDED.name, preis_eur = EXCLUDED.preis_eur`;
        }
        console.log("Products seeded.");

        // Initial Customer
        await sql`
            INSERT INTO kunden (kunden_id, firma_name, kontakt_vorname, kontakt_familienname, email, telefon, adresse, stadt, plz, land, sprache, erstellt_am)
            VALUES ('C00001', 'Musterfirma', 'Max', 'Muster', 'max.muster@mail.com', '4366012345678', 'Rennweg 73', 'Wien', '1030', 'AT', 'DE', '2025-01-01')
            ON CONFLICT (kunden_id) DO NOTHING`;
        console.log("Initial customer seeded.");

        console.log("Migration complete.");
    } catch (error) {
        console.error("Migration failed:", error);
    }
}

migrate();
