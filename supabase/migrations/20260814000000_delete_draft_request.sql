-- Drafts have never left their author, so they can be deleted for good (submitted requests are cancelled instead).
CREATE OR REPLACE FUNCTION delete_draft_request(p_request_id uuid)
RETURNS void
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
  IF v_req.status <> 'draft' THEN RAISE EXCEPTION 'Only drafts can be deleted'; END IF;
  IF v_req.created_by <> v_uid AND NOT is_my_admin() THEN RAISE EXCEPTION 'Only the author can delete a draft'; END IF;

  -- lines, attachments, approvals and activity cascade
  DELETE FROM requests WHERE id = p_request_id;
END;
$$;
GRANT EXECUTE ON FUNCTION delete_draft_request(uuid) TO authenticated;
