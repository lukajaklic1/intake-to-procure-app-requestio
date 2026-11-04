-- The amounts printed on the supplier's invoice: net, VAT, and the total (document_total) that was already there.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS document_net numeric(12,2);
GRANT UPDATE (document_net) ON invoices TO authenticated;
