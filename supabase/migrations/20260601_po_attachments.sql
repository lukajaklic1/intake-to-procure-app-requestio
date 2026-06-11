-- Multiple attachments per PO
CREATE TABLE IF NOT EXISTS po_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id        uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_path    text NOT NULL,
  file_name    text NOT NULL,
  file_size    bigint,
  created_at   timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE po_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can manage attachments"
ON po_attachments FOR ALL
TO authenticated
USING  (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));

-- Index
CREATE INDEX IF NOT EXISTS idx_po_attachments_po_id ON po_attachments(po_id);
