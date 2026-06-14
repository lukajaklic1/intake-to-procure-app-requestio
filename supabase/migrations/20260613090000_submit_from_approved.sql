-- ============================================================
-- 20260613090000_submit_from_approved.sql
-- Allow (re)submitting from any non-cancelled status (incl. approved).
-- Editing an approved request sends it back for approval.
-- ============================================================

CREATE OR REPLACE FUNCTION submit_request(p_request_id uuid, p_note text DEFAULT NULL)
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
  IF v_req.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled request cannot be submitted'; END IF;

  SELECT manager_id INTO v_manager FROM projects WHERE id = v_req.project_id;
  IF v_manager IS NULL THEN RAISE EXCEPTION 'Project has no manager assigned'; END IF;

  DELETE FROM approvals WHERE request_id = p_request_id;
  INSERT INTO approvals (request_id, step, approver_id) VALUES (p_request_id, 1, v_manager);

  UPDATE requests
  SET status = 'pending', approver_id = v_manager,
      decided_by = NULL, decided_at = NULL, decision_note = NULL, updated_at = now()
  WHERE id = p_request_id;

  INSERT INTO activity_log (company_id, request_id, actor_id, action, note)
  VALUES (v_req.company_id, p_request_id, v_uid, 'submitted', p_note);

  RETURN json_build_object('status', 'pending', 'approver_id', v_manager);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_request(uuid, text) TO authenticated;
