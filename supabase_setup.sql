-- ==========================================================
-- SUPABASE DATENBANK-SETUP FÜR WEIHNACHTSSTAND / DÖNER-SYSTEM
-- Kopiere diesen gesamten Code in den "SQL Editor" von Supabase
-- und klicke auf "Run".
-- ==========================================================

-- 1. Tabelle: Produkte
CREATE TABLE produkte (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  beschreibung TEXT,
  preis NUMERIC(10, 2) NOT NULL,
  kategorie TEXT NOT NULL,
  verfuegbar BOOLEAN DEFAULT true,
  hat_extras BOOLEAN DEFAULT false
);

-- 2. Tabelle: Kunden (für Session-ID & Spamschutz)
CREATE TABLE kunden (
  id SERIAL PRIMARY KEY,
  name TEXT,
  telefon_oder_email TEXT,
  session_id TEXT UNIQUE NOT NULL,
  erstellt_am TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabelle: Bestellungen
-- Status-Werte: 'Unbezahlt', 'In Arbeit', 'Fertig', 'Ausgegeben', 'Storniert'
CREATE TABLE bestellungen (
  id SERIAL PRIMARY KEY,
  kunden_id INTEGER REFERENCES kunden(id) ON DELETE SET NULL,
  gesamtpreis NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Unbezahlt',
  zahlungsart TEXT DEFAULT 'Kasse / TWINT',
  zeitstempel TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabelle: Bestellpositionen
CREATE TABLE bestellpositionen (
  id SERIAL PRIMARY KEY,
  bestell_id INTEGER REFERENCES bestellungen(id) ON DELETE CASCADE,
  produkt_id INTEGER REFERENCES produkte(id) ON DELETE SET NULL,
  produkt_name TEXT NOT NULL,
  menge INTEGER NOT NULL DEFAULT 1,
  einzelpreis NUMERIC(10, 2) NOT NULL,
  extras TEXT DEFAULT ''
);

-- 5. Echtzeit (Realtime Websockets) für alle wichtigen Tabellen aktivieren
ALTER PUBLICATION supabase_realtime ADD TABLE bestellungen;
ALTER PUBLICATION supabase_realtime ADD TABLE bestellpositionen;
ALTER PUBLICATION supabase_realtime ADD TABLE produkte;

-- 6. Zugriffsrechte (RLS) für schnellen Start freigeben
ALTER TABLE produkte ENABLE ROW LEVEL SECURITY;
ALTER TABLE kunden ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellungen ENABLE ROW LEVEL SECURITY;
ALTER TABLE bestellpositionen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public Access Produkte" ON produkte FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Kunden" ON kunden FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Bestellungen" ON bestellungen FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public Access Bestellpositionen" ON bestellpositionen FOR ALL USING (true) WITH CHECK (true);

-- 7. Start-Produkte einfügen (Döner & Weihnachtsstand)
INSERT INTO produkte (name, beschreibung, preis, kategorie, verfuegbar, hat_extras) VALUES
('Döner Kebap im Fladenbrot', 'Frisches Fladenbrot mit Kalb/Poulet, Salat und Sauce nach Wahl', 11.50, 'Essen', true, true),
('Dürüm / Yufka Döner', 'Frisch gerollter Teigfladen mit Fleisch, Salat und Sauce', 12.50, 'Essen', true, true),
('Döner Box mit Pommes', 'Knusprige Pommes mit Dönerfleisch und Sauce', 10.50, 'Essen', true, true),
('Portion Pommes Frites', 'Heiss und knusprig', 6.00, 'Essen', true, false),
('Glühwein Hausgemacht', 'Heisser roter Glühwein nach Stand-Rezept (2.5 dl)', 5.50, 'Heissgetränke', true, false),
('Glühwein mit Schuss', 'Hausgemachter Glühwein mit Amaretto oder Rum', 7.50, 'Heissgetränke', true, false),
('Kinderpunsch (Alkoholfrei)', 'Heisser Früchtepunsch mit winterlichen Gewürzen', 4.50, 'Heissgetränke', true, false),
('Gebrannte Mandeln', 'Frisch karamellisierte Mandeln im Tütchen', 5.00, 'Süsswaren', true, false);
