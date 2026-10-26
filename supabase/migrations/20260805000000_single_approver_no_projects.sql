-- Hotel setup: no projects, one company-wide approver (plus the existing
-- over-threshold second approver). Requests are routed to companies.approver_id
-- instead of the project's manager. Projects stay in the database but are no
-- longer required anywhere.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS approver_id uuid REFERENCES users(id);

ALTER TABLE requests        ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE purchase_orders ALTER COLUMN project_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION submit_request(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid;
  v_req      requests%ROWTYPE;
  v_approver uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_req.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled request cannot be submitted'; END IF;

  SELECT approver_id INTO v_approver FROM companies WHERE id = v_req.company_id;
  IF v_approver IS NULL THEN RAISE EXCEPTION 'No approver set. Choose one in Settings.'; END IF;

  DELETE FROM approvals WHERE request_id = p_request_id;
  INSERT INTO approvals (request_id, step, approver_id) VALUES (p_request_id, 1, v_approver);

  UPDATE requests
  SET status = 'pending', approver_id = v_approver,
      decided_by = NULL, decided_at = NULL, decision_note = NULL, updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO activity_log (company_id, request_id, actor_id, action, note)
  VALUES (v_req.company_id, p_request_id, v_uid, 'submitted', p_note);

  RETURN json_build_object('status', 'pending', 'approver_id', v_approver);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_request(uuid, text) TO authenticated;
