-- Add quotation_url column to purchase_orders
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS quotation_url text;

-- Create storage bucket for quotations
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'quotations',
  'quotations',
  false,
  10485760,  -- 10 MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: users can upload/read/delete only their own company's files
CREATE POLICY "Company members can upload quotations"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'quotations'
  AND (storage.foldername(name))[1] = (SELECT get_my_company_id()::text)
);

CREATE POLICY "Company members can read quotations"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'quotations'
  AND (storage.foldername(name))[1] = (SELECT get_my_company_id()::text)
);

CREATE POLICY "Company members can delete quotations"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'quotations'
  AND (storage.foldername(name))[1] = (SELECT get_my_company_id()::text)
);
