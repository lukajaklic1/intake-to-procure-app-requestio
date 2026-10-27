-- Strict hierarchy: category -> subcategory -> item. An item always belongs to a
-- subcategory, never directly to a (top-level) category.

CREATE OR REPLACE FUNCTION items_check_subcategory()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_parent uuid;
BEGIN
  IF NEW.category_id IS NULL THEN RAISE EXCEPTION 'An item needs a subcategory'; END IF;
  SELECT parent_id INTO v_parent FROM categories WHERE id = NEW.category_id;
  IF v_parent IS NULL THEN RAISE EXCEPTION 'An item belongs in a subcategory, not directly in a category'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_items_check_subcategory ON items;
CREATE TRIGGER trg_items_check_subcategory BEFORE INSERT OR UPDATE OF category_id ON items
  FOR EACH ROW EXECUTE FUNCTION items_check_subcategory();
