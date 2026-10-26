-- Suppliers can carry a default incoterm (delivery term), mirroring payment_terms,
-- so PO creation can default it in from the selected supplier instead of retyping it every time.
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS incoterm text;
