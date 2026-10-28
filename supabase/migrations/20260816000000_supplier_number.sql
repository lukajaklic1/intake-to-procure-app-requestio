-- Internal supplier number: 6 digits, per company, starting at 100001. Assigned automatically on insert.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS supplier_next_number integer NOT NULL DEFAULT 100001;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_number text;

-- Existing suppliers are numbered alphabetically
WITH numbered AS (
  SELECT id, 100000 + row_number() OVER (PARTITION BY company_id ORDER BY lower(name), created_at) AS n
  FROM suppliers WHERE supplier_number IS NULL
)
UPDATE suppliers s SET supplier_number = numbered.n::text FROM numbered WHERE s.id = numbered.id;

UPDATE companies c
SET supplier_next_number = greatest(c.supplier_next_number,
  coalesce((SELECT max(supplier_number::integer) + 1 FROM suppliers s WHERE s.company_id = c.id), 100001));

ALTER TABLE suppliers ALTER COLUMN supplier_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_company_number ON suppliers(company_id, supplier_number);

CREATE OR REPLACE FUNCTION assign_supplier_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.supplier_number IS NULL THEN
    UPDATE companies SET supplier_next_number = supplier_next_number + 1
    WHERE id = NEW.company_id
    RETURNING (supplier_next_number - 1)::text INTO NEW.supplier_number;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_supplier_number ON suppliers;
CREATE TRIGGER trg_assign_supplier_number
BEFORE INSERT ON suppliers
FOR EACH ROW EXECUTE FUNCTION assign_supplier_number();
