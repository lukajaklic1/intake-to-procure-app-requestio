-- ============================================================
-- 20260613000000_phase1b_permissions_and_fixes.sql
-- Phase 1b: schema fixes + permissions/invitations infrastructure
-- ============================================================

-- ─── Schema fixes ────────────────────────────────────────────

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN IF NOT EXISTS default_unit_price numeric(12,2);

-- ─── New columns for approvals/permissions (Phase 1b + future Phase 2) ──────

ALTER TABLE companies ADD COLUMN IF NOT EXISTS approval_auto_under numeric(12,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS approval_second_over numeric(12,2);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS team_edit_requests boolean NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_amount numeric(12,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES users(id);

-- Nullable, no FK yet — `requests` table is created in Phase 2, which will add the constraint.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS request_id uuid;

-- ─── generate_po_number RPC ──────────────────────────────────

CREATE OR REPLACE FUNCTION generate_po_number(p_company_id uuid)
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
  SET po_next_number = po_next_number + 1
  WHERE id = p_company_id
  RETURNING po_prefix, po_next_number - 1 INTO v_prefix, v_number;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  RETURN v_prefix || '-' || lpad(v_number::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION generate_po_number(uuid) TO authenticated;

-- ─── user_permissions ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_permissions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module       text NOT NULL CHECK (module IN ('requests','purchase_orders','receipts','invoices','budgets','reports')),
  can_view     boolean NOT NULL DEFAULT false,
  can_create   boolean NOT NULL DEFAULT false,
  can_approve  boolean NOT NULL DEFAULT false,
  can_pay      boolean NOT NULL DEFAULT false,
  UNIQUE (user_id, module)
);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage permissions"
ON user_permissions FOR ALL
TO authenticated
USING (user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())))
WITH CHECK (user_id IN (SELECT id FROM users WHERE company_id = (SELECT get_my_company_id())));

CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);

-- ─── user_invitations ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email        text NOT NULL,
  token        text NOT NULL UNIQUE,
  invited_by   uuid NOT NULL REFERENCES users(id),
  is_admin     boolean NOT NULL DEFAULT false,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at   timestamptz DEFAULT now(),
  accepted_at  timestamptz
);

ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage invitations"
ON user_invitations FOR ALL
TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

CREATE INDEX IF NOT EXISTS idx_user_invitations_company_id ON user_invitations(company_id);

-- ─── Permission RPCs ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_my_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_admin FROM users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION is_my_admin() TO authenticated;

CREATE OR REPLACE FUNCTION has_perm(p_module text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_result boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM users WHERE id = auth.uid();
  IF v_is_admin THEN
    RETURN true;
  END IF;

  SELECT CASE p_action
    WHEN 'view'    THEN can_view
    WHEN 'create'  THEN can_create
    WHEN 'approve' THEN can_approve
    WHEN 'pay'     THEN can_pay
    ELSE false
  END INTO v_result
  FROM user_permissions
  WHERE user_id = auth.uid() AND module = p_module;

  RETURN coalesce(v_result, false);
END;
$$;

GRANT EXECUTE ON FUNCTION has_perm(text, text) TO authenticated;
