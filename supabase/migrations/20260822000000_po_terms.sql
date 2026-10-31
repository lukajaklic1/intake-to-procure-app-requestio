-- Company details that belong on a purchase order (shown in the PDF footer) and the general terms and conditions
-- printed under every order, in Slovenian and in English. All edited in Settings.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS registration_number text;   -- company registration number (matična številka)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS share_capital text;         -- e.g. "7.500,00 EUR"
ALTER TABLE companies ADD COLUMN IF NOT EXISTS register_court text;        -- court and entry no., e.g. "Okrožno sodišče v Kranju, vložek 1/12345/00"
ALTER TABLE companies ADD COLUMN IF NOT EXISTS director_name text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bank_swift text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS po_terms_sl text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS po_terms_en text;
