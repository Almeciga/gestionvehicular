-- ============================================================
-- Ballistic Technology: Enterprise finalization Phase 3
-- Adds: enterprise_id, lifecycle states, immutable snapshots,
--       media_uploads table, organized storage paths
-- ============================================================

-- Add enterprise_id column to inspections
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS enterprise_id TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS unlock_reason TEXT,
  ADD COLUMN IF NOT EXISTS finalized_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending';

-- Unique index on enterprise_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_enterprise_id
  ON public.inspections(enterprise_id)
  WHERE enterprise_id IS NOT NULL;

-- Index for fast search
CREATE INDEX IF NOT EXISTS idx_inspections_placa ON public.inspections(placa);
CREATE INDEX IF NOT EXISTS idx_inspections_propietario ON public.inspections(propietario);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_inspector_id ON public.inspections(inspector_id);
CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON public.inspections(created_at DESC);

-- ─── Media uploads table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.media_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE CASCADE,
  inspection_local_id TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'inspection-photos',
  public_url TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  field_path TEXT, -- e.g. "accesorios[0].fotos[0]"
  checksum TEXT,   -- for deduplication
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'failed', 'deleted')),
  uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Deduplication index
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_uploads_checksum
  ON public.media_uploads(checksum)
  WHERE checksum IS NOT NULL AND status = 'uploaded';

CREATE INDEX IF NOT EXISTS idx_media_uploads_inspection_id ON public.media_uploads(inspection_id);
CREATE INDEX IF NOT EXISTS idx_media_uploads_status ON public.media_uploads(status);

-- RLS for media_uploads
ALTER TABLE public.media_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_uploads_select" ON public.media_uploads;
CREATE POLICY "media_uploads_select"
ON public.media_uploads FOR SELECT
TO authenticated
USING (
  uploaded_by = auth.uid()
  OR public.is_admin()
  OR EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = media_uploads.inspection_id
      AND i.inspector_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "media_uploads_insert" ON public.media_uploads;
CREATE POLICY "media_uploads_insert"
ON public.media_uploads FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.is_active_user());

DROP POLICY IF EXISTS "media_uploads_update" ON public.media_uploads;
CREATE POLICY "media_uploads_update"
ON public.media_uploads FOR UPDATE
TO authenticated
USING (uploaded_by = auth.uid() OR public.is_admin());

-- ─── Function: approve inspection ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_inspection(
  p_inspection_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can approve inspections';
  END IF;

  UPDATE public.inspections
  SET
    status = 'aprobado',
    approved_at = CURRENT_TIMESTAMP,
    approved_by = auth.uid(),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, details)
  VALUES (p_inspection_id, 'approved', auth.uid(), jsonb_build_object('timestamp', CURRENT_TIMESTAMP));

  RETURN true;
END;
$$;

-- ─── Function: reject inspection ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_inspection(
  p_inspection_id UUID,
  p_reason TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can reject inspections';
  END IF;

  UPDATE public.inspections
  SET
    status = 'rechazado',
    rejected_at = CURRENT_TIMESTAMP,
    rejected_by = auth.uid(),
    rejection_reason = p_reason,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, details)
  VALUES (p_inspection_id, 'rejected', auth.uid(), jsonb_build_object('reason', p_reason, 'timestamp', CURRENT_TIMESTAMP));

  RETURN true;
END;
$$;

-- ─── Update admin_unlock to require reason ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_unlock_inspection(
  p_inspection_id UUID,
  p_reason TEXT DEFAULT 'Admin unlock'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can unlock inspections';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Unlock reason is required (minimum 5 characters)';
  END IF;

  UPDATE public.inspections
  SET
    is_locked = false,
    status = 'activo',
    unlocked_at = CURRENT_TIMESTAMP,
    unlocked_by = auth.uid(),
    unlock_reason = p_reason,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_inspection_id;

  INSERT INTO public.inspection_audit_log (inspection_id, action, performed_by, details)
  VALUES (
    p_inspection_id,
    'unlocked',
    auth.uid(),
    jsonb_build_object('reason', p_reason, 'timestamp', CURRENT_TIMESTAMP)
  );

  RETURN true;
END;
$$;

-- ─── View: admin dashboard summary ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.admin_dashboard_view AS
SELECT
  COUNT(*) FILTER (WHERE status = 'pendiente_revision') AS pending_review_count,
  COUNT(*) FILTER (WHERE status = 'rechazado') AS rejected_count,
  COUNT(*) FILTER (WHERE status = 'aprobado') AS approved_count,
  COUNT(*) FILTER (WHERE status = 'finalizado') AS finalized_count,
  COUNT(*) FILTER (WHERE status = 'archivado') AS archived_count,
  COUNT(*) FILTER (WHERE sync_status = 'failed') AS sync_failed_count,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS created_today
FROM public.inspections;

-- ─── Storage bucket policies for organized paths ──────────────────────────────
-- Ensure inspection-photos bucket allows organized paths:
-- inspections/{inspectionId}/photos/
-- inspections/{inspectionId}/videos/
-- pdfs/

-- Update storage bucket file size limit for videos (200MB)
UPDATE storage.buckets
SET
  file_size_limit = 209715200, -- 200MB
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm'
  ]
WHERE id = 'inspection-photos';

-- Storage RLS: allow authenticated users to upload to their inspection paths
DROP POLICY IF EXISTS "inspection_photos_upload" ON storage.objects;
CREATE POLICY "inspection_photos_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inspection-photos'
  AND public.is_active_user()
);

DROP POLICY IF EXISTS "inspection_photos_select" ON storage.objects;
CREATE POLICY "inspection_photos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'inspection-photos');

DROP POLICY IF EXISTS "inspection_photos_delete" ON storage.objects;
CREATE POLICY "inspection_photos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'inspection-photos'
  AND public.is_admin()
);
