-- Remember the status a PO had before being cancelled/closed, so an admin
-- can reopen it back to that exact status.
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS prev_status text;
