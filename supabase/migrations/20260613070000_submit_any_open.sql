-- ============================================================
-- 20260613070000_submit_any_open.sql
-- Allow (re)submitting from draft, pending or rejected.
-- Re-submitting resets the approval chain to step 1.
-- ============================================================

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
  IF v_req.status NOT IN ('draft', 'pending', 'rejected') THEN
    RAISE EXCEPTION 'This request cannot be submitted';
  END IF;

  SELECT manager_id INTO v_manager FROM projects WHERE id = v_req.project_id;
  IF v_manager IS NULL THEN RAISE EXCEPTION 'Project has no manager assigned'; END IF;

  DELETE FROM approvals WHERE request_id = p_request_id;
  INSERT INTO approvals (request_id, step, approver_id) VALUES (p_request_id, 1, v_manager);

  UPDATE requests
  SET status = 'pending', approver_id = v_manager,
      decided_by = NULL, decided_at = NULL, decision_note = NULL, updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object('status', 'pending', 'approver_id', v_manager);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_request(uuid) TO authenticated;
