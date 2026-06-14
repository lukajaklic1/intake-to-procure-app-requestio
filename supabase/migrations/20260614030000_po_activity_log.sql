-- ============================================================
-- 20260614030000_po_activity_log.sql
-- Drop change-order structures; add a simple PO audit trail.
-- ============================================================

DROP FUNCTION IF EXISTS save_po_change_order(uuid, text);
DROP TABLE IF EXISTS po_versions;

CREATE TABLE IF NOT EXISTS po_activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  po_id       uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,   -- created | edited | issued | sent | closed | cancelled
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_po_activity_po ON po_activity_log(po_id, created_at);

ALTER TABLE po_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members see PO activity"
ON po_activity_log FOR ALL
TO authenticated
USING (company_id = (SELECT get_my_company_id()))
WITH CHECK (company_id = (SELECT get_my_company_id()));
