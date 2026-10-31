-- The sidebar counters refresh on their own: Supabase Realtime tells the app when one of these tables changes.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['requests', 'purchase_orders', 'contracts', 'invoices'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
