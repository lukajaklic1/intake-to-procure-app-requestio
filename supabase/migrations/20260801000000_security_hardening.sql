-- ============================================================
-- 20260801000000_security_hardening.sql
-- Close RLS privilege-escalation gaps found in a security review.
-- All previously-existing RPCs (submit_request, decide_approval,
-- cancel_request, create_po_from_request, create_receipt,
-- handle_onboarding, accept_invitation, ...) are SECURITY DEFINER
-- and owned by the same role that owns these tables, so they keep
-- working unchanged — Postgres RLS/column-privilege checks are
-- bypassed for the table owner. Only direct client (PostgREST)
-- access is affected by this migration.
-- ============================================================

-- ─── users ───────────────────────────────────────────────────
-- No direct client-side row creation: handle_onboarding() and
-- accept_invitation() are the only ways a users row is created.
DROP POLICY IF EXISTS "users_insert" ON users;

-- Admin-only deletion (removing a teammate from the company).
DROP POLICY IF EXISTS "users_delete" ON users;
CREATE POLICY "users_delete"
ON users FOR DELETE TO authenticated
USING (is_my_admin() AND company_id = (SELECT get_my_company_id()));

-- Guard updates: a non-admin may only edit their own row and may
-- never flip their own is_admin flag; nobody may move a row to a
-- different company via direct update.
CREATE OR REPLACE FUNCTION guard_users_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_my_admin() THEN
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'Only an admin can edit another user';
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'Only an admin can change admin status';
    END IF;
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'company_id cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_users_update ON users;
CREATE TRIGGER trg_guard_users_update
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION guard_users_update();

-- ─── user_permissions: admin-only writes ────────────────────────
DROP POLICY IF EXISTS "Company members can manage permissions" ON user_permissions;

CREATE POLICY "user_permissions_select"
ON user_permissions FOR SELECT TO authenticated
USING (user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())));

CREATE POLICY "user_permissions_admin_insert"
ON user_permissions FOR INSERT TO authenticated
WITH CHECK (is_my_admin() AND user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())));

CREATE POLICY "user_permissions_admin_update"
ON user_permissions FOR UPDATE TO authenticated
USING (is_my_admin() AND user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())))
WITH CHECK (is_my_admin() AND user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())));

CREATE POLICY "user_permissions_admin_delete"
ON user_permissions FOR DELETE TO authenticated
USING (is_my_admin() AND user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())));

-- ─── user_invitations: admin-only, fully ────────────────────────
-- (SELECT stays open to all company members: the dashboard checklist
-- counts pending invitations for every user, not just admins.)
DROP POLICY IF EXISTS "Company members can manage invitations" ON user_invitations;

CREATE POLICY "user_invitations_select"
ON user_invitations FOR SELECT TO authenticated
USING (company_id = (SELECT get_my_company_id()));

CREATE POLICY "user_invitations_admin_insert"
ON user_invitations FOR INSERT TO authenticated
WITH CHECK (is_my_admin() AND company_id = (SELECT get_my_company_id()));

CREATE POLICY "user_invitations_admin_update"
ON user_invitations FOR UPDATE TO authenticated
USING (is_my_admin() AND company_id = (SELECT get_my_company_id()))
WITH CHECK (is_my_admin() AND company_id = (SELECT get_my_company_id()));

CREATE POLICY "user_invitations_admin_delete"
ON user_invitations FOR DELETE TO authenticated
USING (is_my_admin() AND company_id = (SELECT get_my_company_id()));

-- ─── approvals: SELECT only — all writes via submit_request /
-- decide_approval (SECURITY DEFINER, bypass RLS as table owner) ──
DROP POLICY IF EXISTS "Company members see approvals" ON approvals;

CREATE POLICY "approvals_select"
ON approvals FOR SELECT TO authenticated
USING (request_id IN (SELECT id FROM requests WHERE company_id = (SELECT get_my_company_id())));

-- ─── activity_log / po_activity_log: append-only audit trails ──
DROP POLICY IF EXISTS "Company members see activity log" ON activity_log;

CREATE POLICY "activity_log_select"
ON activity_log FOR SELECT TO authenticated
USING (company_id = (SELECT get_my_company_id()));

CREATE POLICY "activity_log_insert"
ON activity_log FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT get_my_company_id()) AND actor_id = auth.uid());

DROP POLICY IF EXISTS "Company members see PO activity" ON po_activity_log;

CREATE POLICY "po_activity_log_select"
ON po_activity_log FOR SELECT TO authenticated
USING (company_id = (SELECT get_my_company_id()));

CREATE POLICY "po_activity_log_insert"
ON po_activity_log FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT get_my_company_id()) AND actor_id = auth.uid());

-- ─── requests: creator/admin (or team_edit_requests) can edit
-- content directly; status/decision fields are RPC-only ─────────
DROP POLICY IF EXISTS "Company members manage requests" ON requests;

CREATE POLICY "requests_select"
ON requests FOR SELECT TO authenticated
USING (company_id = (SELECT get_my_company_id()));

CREATE POLICY "requests_insert"
ON requests FOR INSERT TO authenticated
WITH CHECK (company_id = (SELECT get_my_company_id()) AND created_by = auth.uid());

CREATE POLICY "requests_update"
ON requests FOR UPDATE TO authenticated
USING (
  company_id = (SELECT get_my_company_id())
  AND (
    created_by = auth.uid()
    OR is_my_admin()
    OR (SELECT team_edit_requests FROM companies WHERE id = (SELECT get_my_company_id()))
  )
)
WITH CHECK (
  company_id = (SELECT get_my_company_id())
  AND (
    created_by = auth.uid()
    OR is_my_admin()
    OR (SELECT team_edit_requests FROM companies WHERE id = (SELECT get_my_company_id()))
  )
);
-- No DELETE policy: requests are cancelled (cancel_request RPC), never deleted directly.

-- Status/approver/decision/PO-link fields change only via
-- submit_request / decide_approval / cancel_request /
-- create_po_from_request — never directly by a client.
REVOKE UPDATE ON requests FROM authenticated;
GRANT UPDATE (
  project_id, supplier_id, supplier_name, category_id, location_id,
  department_id, needed_by_date, note, discount_amount, total_estimate, updated_at
) ON requests TO authenticated;

-- ─── request_line_items: same edit eligibility as their request ─
DROP POLICY IF EXISTS "Company members manage request lines" ON request_line_items;

CREATE POLICY "request_line_items_select"
ON request_line_items FOR SELECT TO authenticated
USING (request_id IN (SELECT id FROM requests WHERE company_id = (SELECT get_my_company_id())));

CREATE POLICY "request_line_items_write"
ON request_line_items FOR ALL TO authenticated
USING (request_id IN (
  SELECT id FROM requests
  WHERE company_id = (SELECT get_my_company_id())
    AND (created_by = auth.uid() OR is_my_admin()
         OR (SELECT team_edit_requests FROM companies WHERE id = (SELECT get_my_company_id())))
))
WITH CHECK (request_id IN (
  SELECT id FROM requests
  WHERE company_id = (SELECT get_my_company_id())
    AND (created_by = auth.uid() OR is_my_admin()
         OR (SELECT team_edit_requests FROM companies WHERE id = (SELECT get_my_company_id())))
));

-- ─── receipts / receipt_line_items: writes only via create_receipt
-- (SECURITY DEFINER, checks has_perm('receipts','create')) ───────
DROP POLICY IF EXISTS "Company members manage receipts" ON receipts;

CREATE POLICY "receipts_select"
ON receipts FOR SELECT TO authenticated
USING (company_id = (SELECT get_my_company_id()));

DROP POLICY IF EXISTS "Company members manage receipt lines" ON receipt_line_items;

CREATE POLICY "receipt_line_items_select"
ON receipt_line_items FOR SELECT TO authenticated
USING (receipt_id IN (SELECT id FROM receipts WHERE company_id = (SELECT get_my_company_id())));
