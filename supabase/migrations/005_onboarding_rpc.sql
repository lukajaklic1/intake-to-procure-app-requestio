CREATE OR REPLACE FUNCTION public.handle_onboarding(
  p_company_name text,
  p_first_name   text,
  p_last_name    text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid;
  v_company_id uuid;
  v_user_email text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  INSERT INTO public.companies (name, currency, po_prefix, po_next_number)
  VALUES (p_company_name, 'EUR', 'PO', 1)
  RETURNING id INTO v_company_id;

  INSERT INTO public.users (id, company_id, first_name, last_name, email, is_admin)
  VALUES (v_user_id, v_company_id, p_first_name, p_last_name, v_user_email, true);

  RETURN json_build_object('company_id', v_company_id, 'user_id', v_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_onboarding TO authenticated;
