-- ============================================================
-- 20260613020000_invite_full_profile.sql
-- Admin sets full profile (name, department, job title, permissions)
-- at invite time. Invited user only sets a password.
-- ============================================================

-- Job title on users + invitations carry the full profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS job_title text;

ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS first_name   text;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS last_name    text;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES departments(id);
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS job_title    text;
ALTER TABLE user_invitations ADD COLUMN IF NOT EXISTS permissions  jsonb;

-- Replace accept_invitation: no name args, reads everything from the invitation
DROP FUNCTION IF EXISTS public.accept_invitation(text, text);

CREATE OR REPLACE FUNCTION public.accept_invitation()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid;
  v_email text;
  v_inv   user_invitations%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  SELECT * INTO v_inv
  FROM user_invitations
  WHERE lower(email) = lower(v_email) AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'No pending invitation for this email';
  END IF;

  -- Create the profile from the invitation (idempotent)
  INSERT INTO public.users (id, company_id, first_name, last_name, email, is_admin, department_id, job_title)
  VALUES (v_uid, v_inv.company_id, coalesce(v_inv.first_name, ''), coalesce(v_inv.last_name, ''), v_email, v_inv.is_admin, v_inv.department_id, v_inv.job_title)
  ON CONFLICT (id) DO UPDATE
    SET first_name    = EXCLUDED.first_name,
        last_name     = EXCLUDED.last_name,
        department_id = EXCLUDED.department_id,
        job_title     = EXCLUDED.job_title;

  -- Apply permissions set by the admin at invite time
  IF v_inv.permissions IS NOT NULL THEN
    INSERT INTO public.user_permissions (user_id, module, can_view, can_create, can_approve, can_pay)
    SELECT v_uid,
           p->>'module',
           coalesce((p->>'can_view')::boolean, false),
           coalesce((p->>'can_create')::boolean, false),
           coalesce((p->>'can_approve')::boolean, false),
           coalesce((p->>'can_pay')::boolean, false)
    FROM jsonb_array_elements(v_inv.permissions) AS p
    ON CONFLICT (user_id, module) DO UPDATE
      SET can_view = EXCLUDED.can_view,
          can_create = EXCLUDED.can_create,
          can_approve = EXCLUDED.can_approve,
          can_pay = EXCLUDED.can_pay;
  END IF;

  UPDATE user_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  RETURN json_build_object('company_id', v_inv.company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation() TO authenticated;
