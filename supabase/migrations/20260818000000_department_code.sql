-- Optional cost-centre code of a department (e.g. 4100), unique within the company when filled in.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS code text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_departments_company_code
  ON departments (company_id, upper(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';
