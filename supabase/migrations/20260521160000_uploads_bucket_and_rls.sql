-- ============================================================
-- GestionVehicular: Add "uploads" storage bucket for PDF exports
-- Idempotent — safe to run multiple times
-- ============================================================

-- Create the "uploads" private bucket for PDF storage (signed URL access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uploads',
  'uploads',
  false,
  52428800, -- 50 MB max per file
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- RLS: authenticated active users can upload to uploads bucket
DROP POLICY IF EXISTS "uploads_insert" ON storage.objects;
CREATE POLICY "uploads_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'uploads'
  AND public.is_active_user()
);

-- RLS: authenticated active users can read from uploads bucket
DROP POLICY IF EXISTS "uploads_select" ON storage.objects;
CREATE POLICY "uploads_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'uploads'
  AND public.is_active_user()
);

-- RLS: only admins can delete from uploads bucket
DROP POLICY IF EXISTS "uploads_delete" ON storage.objects;
CREATE POLICY "uploads_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'uploads'
  AND public.is_admin()
);

-- RLS: only admins can update objects in uploads bucket
DROP POLICY IF EXISTS "uploads_update" ON storage.objects;
CREATE POLICY "uploads_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'uploads' AND public.is_admin())
WITH CHECK (bucket_id = 'uploads' AND public.is_admin());
