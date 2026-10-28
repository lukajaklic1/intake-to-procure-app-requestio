-- A VAT number identifies one supplier: no two suppliers of a company may share it (spaces and case ignored).
-- Suppliers without a VAT number are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_company_vat
  ON suppliers (company_id, upper(replace(vat_number, ' ', '')))
  WHERE vat_number IS NOT NULL AND btrim(vat_number) <> '';
