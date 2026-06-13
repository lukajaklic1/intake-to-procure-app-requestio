-- ============================================================
-- 20260613030000_phase2_requests.sql
-- Phase 2: requests + single-step approval (project manager)
-- ============================================================

-- Request number counter on companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS req_prefix text NOT NULL DEFAULT 'REQ';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS req_next_number integer NOT NULL DEFAULT 1;

-- ─── requests ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_number  text NOT NULL,
  created_by      uuid NOT NULL REFERENCES users(id),
  project_id      uuid NOT NULL REFERENCES projects(id),
  supplier_id     uuid REFERENCES suppliers(id),
  supplier_name   text,
  category_id     uuid REFERENCES categories(id),
  location_id     uuid REFERENCES locations(id),
  department_id   uuid REFERENCES departments(id),
  needed_by_date  date,
  note            text,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_estimate  numeric(12,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending','approved','rejected','cancelled')),
  approver_id     uuid REFERENCES users(id),   -- project manager at submit time
  decided_by      uuid REFERENCES users(id),
  decided_at      timestamptz,
  decision_note   text,
  po_id           uuid,                         -- linked PO (Phase 3)
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_company ON requests(company_id);
CREATE INDEX IF NOT EXISTS idx_requests_approver ON requests(approver_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON requests(created_by);

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage requests"
ON requests FOR ALL
TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

-- ─── request_line_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS request_line_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  item_id          uuid REFERENCES items(id),
  position         integer NOT NULL DEFAULT 10,
  name             text NOT NULL,
  long_description text,
  quantity         numeric(12,3) NOT NULL,
  unit             text NOT NULL DEFAULT 'kos',
  est_unit_price   numeric(12,2) NOT NULL DEFAULT 0,
  line_total       numeric(12,2) GENERATED ALWAYS AS (quantity * est_unit_price) STORED,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_request_lines_request ON request_line_items(request_id);

ALTER TABLE request_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members manage request lines"
ON request_line_items FOR ALL
TO authenticated
USING (request_id IN (SELECT id FROM requests WHERE company_id = (SELECT get_my_company_id())))
WITH CHECK (request_id IN (SELECT id FROM requests WHERE company_id = (SELECT get_my_company_id())));

-- ─── generate_request_number ─────────────────────────────────
CREATE OR REPLACE FUNCTION generate_request_number(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_number integer;
BEGIN
  UPDATE companies
  SET req_next_number = req_next_number + 1
  WHERE id = p_company_id
  RETURNING req_prefix, req_next_number - 1 INTO v_prefix, v_number;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  RETURN v_prefix || '-' || lpad(v_number::text, 4, '0');
END;
$$;
GRANT EXECUTE ON FUNCTION generate_request_number(uuid) TO authenticated;

-- ─── submit_request ──────────────────────────────────────────
-- Moves a draft to pending; approver = project manager.
-- If the creator is the project manager, auto-approve.
CREATE OR REPLACE FUNCTION submit_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid;
  v_req     requests%ROWTYPE;
  v_manager uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_req.status <> 'draft' THEN RAISE EXCEPTION 'Only draft requests can be submitted'; END IF;

  SELECT manager_id INTO v_manager FROM projects WHERE id = v_req.project_id;
  IF v_manager IS NULL THEN
    RAISE EXCEPTION 'Project has no manager assigned';
  END IF;

  IF v_manager = v_uid THEN
    -- creator is the approver → auto-approve
    UPDATE requests
    SET status = 'approved', approver_id = v_manager,
        decided_by = v_uid, decided_at = now(), updated_at = now()
    WHERE id = p_request_id;
    RETURN json_build_object('status', 'approved');
  ELSE
    UPDATE requests
    SET status = 'pending', approver_id = v_manager, updated_at = now()
    WHERE id = p_request_id;
    RETURN json_build_object('status', 'pending', 'approver_id', v_manager);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION submit_request(uuid) TO authenticated;

-- ─── decide_request ──────────────────────────────────────────
-- Approver (or admin) approves/rejects a pending request.
CREATE OR REPLACE FUNCTION decide_request(p_request_id uuid, p_approved boolean, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_req requests%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'Only pending requests can be decided'; END IF;
  IF v_req.approver_id <> v_uid AND NOT is_my_admin() THEN
    RAISE EXCEPTION 'Only the assigned approver can decide';
  END IF;

  UPDATE requests
  SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      decided_by = v_uid, decided_at = now(), decision_note = p_note, updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END);
END;
$$;
GRANT EXECUTE ON FUNCTION decide_request(uuid, boolean, text) TO authenticated;

-- ─── cancel_request ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION cancel_request(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_req requests%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_req.created_by <> v_uid AND NOT is_my_admin() THEN
    RAISE EXCEPTION 'Only the creator or an admin can cancel';
  END IF;
  IF v_req.status IN ('cancelled') THEN RAISE EXCEPTION 'Already cancelled'; END IF;

  UPDATE requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('status', 'cancelled');
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_request(uuid) TO authenticated;
