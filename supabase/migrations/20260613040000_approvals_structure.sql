-- ============================================================
-- 20260613040000_approvals_structure.sql
-- Full multi-step approval structure:
--   step 1 = project manager (always)
--   step 2 = company director/second approver (only if total > threshold)
-- No auto-approve: a submitted request always requires approval.
-- ============================================================

-- Chosen director / second approver (over-threshold step)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS second_approver_id uuid REFERENCES users(id);

-- ─── approvals (steps) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  step          integer NOT NULL,
  approver_id   uuid NOT NULL REFERENCES users(id),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approvals_request ON approvals(request_id);
CREATE INDEX IF NOT EXISTS idx_approvals_approver ON approvals(approver_id, status);

ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members see approvals"
ON approvals FOR ALL
TO authenticated
USING (request_id IN (SELECT id FROM requests WHERE company_id = (SELECT get_my_company_id())))
WITH CHECK (request_id IN (SELECT id FROM requests WHERE company_id = (SELECT get_my_company_id())));

-- ─── submit_request (rewrite: always to approval, create step 1) ──
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
  IF v_manager IS NULL THEN RAISE EXCEPTION 'Project has no manager assigned'; END IF;

  -- Clear any stale steps, create step 1 (project manager) — always requires approval
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

-- ─── decide_approval (per-step decision; lazily creates step 2) ──
DROP FUNCTION IF EXISTS decide_request(uuid, boolean, text);

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
    RETURN json_build_object('status', 'rejected');
  END IF;

  -- approved
  UPDATE approvals SET status = 'approved', decided_at = now(), decision_note = p_note WHERE id = v_ap.id;

  IF v_ap.step = 1 THEN
    SELECT approval_second_over, second_approver_id INTO v_threshold, v_director
    FROM companies WHERE id = v_req.company_id;

    IF v_threshold IS NOT NULL AND v_threshold > 0
       AND v_director IS NOT NULL AND v_director <> v_ap.approver_id
       AND v_req.total_estimate > v_threshold THEN
      -- escalate to director (step 2)
      INSERT INTO approvals (request_id, step, approver_id) VALUES (v_req.id, 2, v_director);
      UPDATE requests SET approver_id = v_director, updated_at = now() WHERE id = v_req.id;
      RETURN json_build_object('status', 'pending', 'next_step', 2);
    END IF;
  END IF;

  -- no further steps → approved
  UPDATE requests SET status = 'approved', decided_by = v_uid, decided_at = now(), updated_at = now()
  WHERE id = v_req.id;
  RETURN json_build_object('status', 'approved');
END;
$$;
GRANT EXECUTE ON FUNCTION decide_approval(uuid, boolean, text) TO authenticated;
