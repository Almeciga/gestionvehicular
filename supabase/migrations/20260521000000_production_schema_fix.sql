-- ============================================================
-- Production Schema Fix: Ensure all tables match app expectations
-- Safe to run multiple times (idempotent)
-- ============================================================

-- 1. Ensure profiles table has all required columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS full_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 2. Ensure vehicles table has all required columns
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS fecha_creacion TEXT,
  ADD COLUMN IF NOT EXISTS materials JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Add local_id for offline sync deduplication
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS local_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_local_id ON public.vehicles(local_id) WHERE local_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_placa ON public.vehicles(placa);

-- 3. Ensure inspections table has all required columns
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS finalization_timestamp TEXT,
  ADD COLUMN IF NOT EXISTS creation_timestamp TEXT,
  ADD COLUMN IF NOT EXISTS inspector_name TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_local_id ON public.inspections(local_id) WHERE local_id IS NOT NULL;

-- 4. pdf_exports table (for audit trail)
CREATE TABLE IF NOT EXISTS public.pdf_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ DEFAULT now(),
  filename TEXT,
  inspection_placa TEXT,
  is_regeneration BOOLEAN DEFAULT false
);

ALTER TABLE public.pdf_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pdf_exports_admin_all" ON public.pdf_exports;
CREATE POLICY "pdf_exports_admin_all"
ON public.pdf_exports FOR ALL
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "pdf_exports_own_select" ON public.pdf_exports;
CREATE POLICY "pdf_exports_own_select"
ON public.pdf_exports FOR SELECT
TO authenticated
USING (generated_by = auth.uid() OR public.is_admin());

-- 5. inspection_audit_log table
CREATE TABLE IF NOT EXISTS public.inspection_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.inspection_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_admin_all" ON public.inspection_audit_log;
CREATE POLICY "audit_log_admin_all"
ON public.inspection_audit_log FOR ALL
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "audit_log_own_insert" ON public.inspection_audit_log;
CREATE POLICY "audit_log_own_insert"
ON public.inspection_audit_log FOR INSERT
TO authenticated
WITH CHECK (performed_by = auth.uid());

-- 6. Ensure Supabase Storage bucket "uploads" exists (run manually if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', false) ON CONFLICT DO NOTHING;
-- INSERT INTO storage.buckets (id, name, public) VALUES ('inspection-photos', 'inspection-photos', false) ON CONFLICT DO NOTHING;

-- 7. Storage RLS policies for inspection-photos bucket
DROP POLICY IF EXISTS "inspection_photos_upload" ON storage.objects;
CREATE POLICY "inspection_photos_upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'inspection-photos' AND public.is_active_user());

DROP POLICY IF EXISTS "inspection_photos_read" ON storage.objects;
CREATE POLICY "inspection_photos_read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'inspection-photos' AND public.is_active_user());

DROP POLICY IF EXISTS "inspection_photos_delete_admin" ON storage.objects;
CREATE POLICY "inspection_photos_delete_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'inspection-photos' AND public.is_admin());

-- 8. Seed admin user profile (safe upsert — only runs if user exists in auth.users)
-- Run this separately in SQL editor after creating the auth user:
-- WITH u AS (SELECT id FROM auth.users WHERE email = 'martinmontoya081@gmail.com')
-- INSERT INTO public.profiles (id, email, role, full_name, is_active, must_reset_password)
-- SELECT id, 'martinmontoya081@gmail.com', 'admin', 'Martin Montoya', true, false FROM u
-- ON CONFLICT (id) DO UPDATE SET role = 'admin', is_active = true, must_reset_password = false;
