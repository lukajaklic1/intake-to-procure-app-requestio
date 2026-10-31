-- Request numbers: two digits of the year + a four-digit counter that starts again every year
-- (260001 is the first request of 2026, 270001 the first of 2027; room for 9999 a year). The company prefix stays: ZAH-260001.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS req_year integer;

CREATE OR REPLACE FUNCTION generate_request_number(p_company_id uuid)
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
  SET req_next_number = CASE WHEN req_year = v_yy THEN req_next_number + 1 ELSE 2 END,
      req_year = v_yy
  WHERE id = p_company_id
  RETURNING req_prefix, req_next_number - 1 INTO v_prefix, v_seq;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  RETURN (CASE WHEN COALESCE(v_prefix, '') = '' THEN '' ELSE v_prefix || '-' END) || lpad(v_yy::text, 2, '0') || lpad(v_seq::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION generate_request_number(uuid) TO authenticated;

-- existing requests: renumbered by the year they were created in, oldest first
WITH numbered AS (
  SELECT r.id, c.req_prefix,
         to_char(r.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY') AS yy,
         row_number() OVER (
           PARTITION BY r.company_id, to_char(r.created_at AT TIME ZONE 'Europe/Ljubljana', 'YY')
           ORDER BY r.created_at, r.request_number
         ) AS n
  FROM requests r
  JOIN companies c ON c.id = r.company_id
)
UPDATE requests r
SET request_number = (CASE WHEN COALESCE(n.req_prefix, '') = '' THEN '' ELSE n.req_prefix || '-' END) || n.yy || lpad(n.n::text, 4, '0')
FROM numbered n
WHERE n.id = r.id;

-- the counters carry on after the requests of this year
UPDATE companies c
SET req_year = (extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))::integer % 100),
    req_next_number = 1 + (
      SELECT count(*) FROM requests r
      WHERE r.company_id = c.id
        AND extract(year FROM (r.created_at AT TIME ZONE 'Europe/Ljubljana')) = extract(year FROM (now() AT TIME ZONE 'Europe/Ljubljana'))
    );
