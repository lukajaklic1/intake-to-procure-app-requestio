-- Extra discount negotiated by procurement on a purchase order. Internal only: for tracking savings,
-- it is not printed on the order document and not part of the order total.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS negotiated_discount numeric(12,2) CHECK (negotiated_discount IS NULL OR negotiated_discount >= 0);
