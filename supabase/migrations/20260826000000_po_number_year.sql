-- Purchase order numbers: prefix + two digits of the year + a four-digit counter that starts again every year
-- (PO-260001 is the first order of 2026, PO-270001 the first of 2027; room for 9999 a year), same as the requests.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS po_year integer;

CREATE OR REPLACE FUNCTION generate_po_number(p_company_id uuid)
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
  -- one atomic update: counts on within the year, starts at 1 in a new year
  UPDATE companies
  SET po_next_number = CASE WHEN po_year = v_yy THEN po_next_number + 1 ELSE 2 END,
      po_year = v_yy
  WHERE id = p_company_id
  RETURNING po_prefix, po_next_number - 1 INTO v_prefix, v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  RETURN COALESCE(v_prefix, 'PO') || '-' || lpad(v_yy::text, 2, '0') || lpad(v_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION generate_po_number(uuid) TO authenticated;

-- existing orders: renumbered by the year they were created in, oldest first
WITH numbered AS (
  SELECT p.id, c.po_prefix,
         to_char(p.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY') AS yy,
         row_number() OVER (
           PARTITION BY p.company_id, to_char(p.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY')
           ORDER BY p.created_at, p.po_number
         ) AS n
  FROM purchase_orders p
  JOIN companies c ON c.id = p.company_id
)
UPDATE purchase_orders p
SET po_number = COALESCE(n.po_prefix, 'PO') || '-' || n.yy || lpad(n.n::text, 4, '0')
FROM numbered n
WHERE n.id = p.id;

-- the counters carry on after the orders of this year
UPDATE companies c
SET po_year = (extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))::integer % 100),
    po_next_number = 1 + (
      SELECT count(*) FROM purchase_orders p
      WHERE p.company_id = c.id
        AND extract(year FROM (p.created_at AT TIME ZONE 'Europe/Ljubljana')) = extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))
    );
