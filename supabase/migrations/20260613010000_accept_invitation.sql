-- ============================================================
-- 20260613010000_accept_invitation.sql
-- RPC: invited user accepts → profile created in the inviting company
-- ============================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_first_name text,
  p_last_name  text
)
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

  -- Create the profile in the inviting company (idempotent)
  INSERT INTO public.users (id, company_id, first_name, last_name, email, is_admin)
  VALUES (v_uid, v_inv.company_id, p_first_name, p_last_name, v_email, v_inv.is_admin)
  ON CONFLICT (id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name;

  UPDATE user_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_inv.id;

  RETURN json_build_object('company_id', v_inv.company_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation TO authenticated;
