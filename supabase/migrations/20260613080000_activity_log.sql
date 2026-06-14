-- ============================================================
-- 20260613080000_activity_log.sql
-- Full audit trail for requests + log events inside RPCs.
-- ============================================================

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  request_id  uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,   -- created | edited | submitted | approved | rejected | cancelled
  note        text,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_request ON activity_log(request_id, created_at);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members see activity log"
ON activity_log FOR ALL
TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

-- ─── submit_request (adds optional note + logs) ──────────────
DROP FUNCTION IF EXISTS submit_request(uuid);

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

  INSERT INTO activity_log (company_id, request_id, actor_id, action, note)
  VALUES (v_req.company_id, p_request_id, v_uid, 'submitted', p_note);

  RETURN json_build_object('status', 'pending', 'approver_id', v_manager);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_request(uuid, text) TO authenticated;

-- ─── decide_approval (logs approved/rejected) ────────────────
CREATE OR REPLACE FUNCTION decide_approval(p_approval_id uuid, p_approved boolean, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid;
  v_ap        approvals%ROWTYPE;
  v_req       requests%ROWTYPE;
  v_threshold numeric;
  v_director  uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_ap FROM approvals WHERE id = p_approval_id;
  IF v_ap.id IS NULL THEN RAISE EXCEPTION 'Approval not found'; END IF;

  SELECT * INTO v_req FROM requests WHERE id = v_ap.request_id;
  IF v_req.company_id <> get_my_company_id() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_ap.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;
  IF v_ap.approver_id <> v_uid AND NOT is_my_admin() THEN
    RAISE EXCEPTION 'Only the assigned approver can decide';
  END IF;

  IF NOT p_approved THEN
    UPDATE approvals SET status = 'rejected', decided_at = now(), decision_note = p_note WHERE id = v_ap.id;
    UPDATE requests SET status = 'rejected', decided_by = v_uid, decided_at = now(),
                        decision_note = p_note, updated_at = now()
    WHERE id = v_req.id;
    INSERT INTO activity_log (company_id, request_id, actor_id, action, note, meta)
    VALUES (v_req.company_id, v_req.id, v_uid, 'rejected', p_note, json_build_object('step', v_ap.step));
    RETURN json_build_object('status', 'rejected');
  END IF;

  UPDATE approvals SET status = 'approved', decided_at = now(), decision_note = p_note WHERE id = v_ap.id;
  INSERT INTO activity_log (company_id, request_id, actor_id, action, note, meta)
  VALUES (v_req.company_id, v_req.id, v_uid, 'approved', p_note, json_build_object('step', v_ap.step));

  IF v_ap.step = 1 THEN
    SELECT approval_second_over, second_approver_id INTO v_threshold, v_director
    FROM companies WHERE id = v_req.company_id;

    IF v_threshold IS NOT NULL AND v_threshold > 0
       AND v_director IS NOT NULL AND v_director <> v_ap.approver_id
       AND v_req.total_estimate > v_threshold THEN
      INSERT INTO approvals (request_id, step, approver_id) VALUES (v_req.id, 2, v_director);
      UPDATE requests SET approver_id = v_director, updated_at = now() WHERE id = v_req.id;
      RETURN json_build_object('status', 'pending', 'next_step', 2);
    END IF;
  END IF;

  UPDATE requests SET status = 'approved', decided_by = v_uid, decided_at = now(), updated_at = now()
  WHERE id = v_req.id;
  RETURN json_build_object('status', 'approved');
END;
$$;
GRANT EXECUTE ON FUNCTION decide_approval(uuid, boolean, text) TO authenticated;

-- ─── cancel_request (logs cancelled) ─────────────────────────
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
  IF v_req.status = 'cancelled' THEN RAISE EXCEPTION 'Already cancelled'; END IF;

  UPDATE requests SET status = 'cancelled', updated_at = now() WHERE id = p_request_id;

  INSERT INTO activity_log (company_id, request_id, actor_id, action)
  VALUES (v_req.company_id, p_request_id, v_uid, 'cancelled');

  RETURN json_build_object('status', 'cancelled');
END;
$$;
GRANT EXECUTE ON FUNCTION cancel_request(uuid) TO authenticated;
