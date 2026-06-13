-- ============================================================
-- 20260613050000_request_attachments.sql
-- Attachments (offers/quotes) on requests. Reuses the
-- existing `quotations` storage bucket (company-scoped).
-- ============================================================

CREATE TABLE IF NOT EXISTS request_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_size    bigint,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE request_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage request attachments"
ON request_attachments FOR ALL
TO authenticated
USING  (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

CREATE INDEX IF NOT EXISTS idx_request_attachments_request ON request_attachments(request_id);
