-- Invoice and receipt numbers get the same shape as requests and orders: prefix + two digits of the year +
-- a four-digit counter that starts again every year (RAC-260001, REC-260001; room for 9999 a year).

-- ── Receipts ──
ALTER TABLE companies ADD COLUMN IF NOT EXISTS rec_year integer;

CREATE OR REPLACE FUNCTION generate_receipt_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_seq integer;
  v_yy integer := (extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))::integer % 100);
BEGIN
  UPDATE companies
  SET rec_next_number = CASE WHEN rec_year = v_yy THEN rec_next_number + 1 ELSE 2 END,
      rec_year = v_yy
  WHERE id = p_company_id
  RETURNING rec_prefix, rec_next_number - 1 INTO v_prefix, v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  RETURN COALESCE(v_prefix, 'REC') || '-' || lpad(v_yy::text, 2, '0') || lpad(v_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION generate_receipt_number(uuid) TO authenticated;

-- existing receipts: renumbered by the year they were created in, oldest first
WITH numbered AS (
  SELECT r.id, c.rec_prefix,
         to_char(r.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY') AS yy,
         row_number() OVER (
           PARTITION BY r.company_id, to_char(r.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY')
           ORDER BY r.created_at, r.receipt_number
         ) AS n
  FROM receipts r
  JOIN companies c ON c.id = r.company_id
)
UPDATE receipts r
SET receipt_number = COALESCE(n.rec_prefix, 'REC') || '-' || n.yy || lpad(n.n::text, 4, '0')
FROM numbered n
WHERE n.id = r.id;

UPDATE companies c
SET rec_year = (extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))::integer % 100),
    rec_next_number = 1 + (
      SELECT count(*) FROM receipts r
      WHERE r.company_id = c.id
        AND extract(year FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana')) = extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))
    );

-- ── Invoices ──
CREATE OR REPLACE FUNCTION invoices_set_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_yy text := to_char(now() AT TIME ZONE 'Europe/Ljubljana', 'YY');
  v_next integer;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('invoices:' || NEW.company_id::text));
  SELECT COALESCE(MAX((substring(invoice_number FROM ('^RAC-' || v_yy || '(\d{4})$')))::integer), 0) + 1
    INTO v_next FROM invoices WHERE company_id = NEW.company_id;
  NEW.invoice_number := 'RAC-' || v_yy || lpad(v_next::text, 4, '0');
  RETURN NEW;
END;
$$;

-- existing invoices: renumbered by the year they were created in, oldest first
WITH numbered AS (
  SELECT i.id,
         to_char(i.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY') AS yy,
         row_number() OVER (
           PARTITION BY i.company_id, to_char(i.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY')
           ORDER BY i.created_at, i.invoice_number
         ) AS n
  FROM invoices i
)
UPDATE invoices i
SET invoice_number = 'RAC-' || n.yy || lpad(n.n::text, 4, '0')
FROM numbered n
WHERE n.id = i.id;
