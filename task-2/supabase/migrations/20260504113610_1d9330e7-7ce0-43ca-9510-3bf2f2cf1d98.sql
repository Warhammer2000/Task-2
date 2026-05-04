-- Create gallery-photos bucket (public read; per-user folder write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-photos', 'gallery-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gallery_photos_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery-photos');

CREATE POLICY "gallery_photos_auth_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'gallery-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "gallery_photos_auth_update_own"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'gallery-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

CREATE POLICY "gallery_photos_auth_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'gallery-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);