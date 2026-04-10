-- Create storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true);

-- Allow authenticated users to upload receipts
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'receipts');

-- Allow authenticated users to view receipts
CREATE POLICY "Authenticated users can view receipts"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'receipts');

-- Allow authenticated users to delete their receipts
CREATE POLICY "Authenticated users can delete receipts"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'receipts');