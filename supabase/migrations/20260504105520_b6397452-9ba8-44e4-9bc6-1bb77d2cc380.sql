INSERT INTO storage.buckets (id, name, public)
VALUES ('event-covers', 'event-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_covers_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'event-covers');

CREATE POLICY "event_covers_auth_insert_own"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "event_covers_auth_update_own"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "event_covers_auth_delete_own"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);