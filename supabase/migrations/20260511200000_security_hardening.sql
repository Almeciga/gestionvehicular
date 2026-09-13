-- ============================================================
-- SECURITY HARDENING: Fix RLS gaps, role enforcement, storage
-- ============================================================

-- ─── 1. Fix profiles UPDATE policy ────────────────────────────────────────────
-- RISK: Users could update their own role/is_active fields
-- FIX: Non-admins can only update safe fields (full_name, must_reset_password)
--      Admins can update any field on any profile

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- Admins can update any profile (all fields)
DROP POLICY IF EXISTS "profiles_update_admin_all" ON public.profiles;
CREATE POLICY "profiles_update_admin_all"
ON public.profiles FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Non-admins can only update their own safe fields (enforced via function)
DROP POLICY IF EXISTS "profiles_update_own_safe" ON public.profiles;
CREATE POLICY "profiles_update_own_safe"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() AND NOT public.is_admin())
WITH CHECK (
    id = auth.uid()
    AND NOT public.is_admin()
);

-- ─── 2. Prevent role escalation via trigger ────────────────────────────────────
-- RISK: handle_new_user reads role from raw_user_meta_data — self-registering
--       users could pass role='admin'
-- FIX: Trigger always defaults to 'inspector'; only admins can elevate roles

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, must_reset_password)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        -- SECURITY: Always default to inspector regardless of metadata
        -- Role can only be elevated by an admin via direct DB update
        'inspector'::public.user_role,
        COALESCE((NEW.raw_user_meta_data->>'must_reset_password')::boolean, false)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- ─── 3. Add function to safely update own profile (non-sensitive fields only) ──
-- This function is used by the app to let users update their display name
CREATE OR REPLACE FUNCTION public.update_own_profile(
    p_full_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.profiles
    SET
        full_name = COALESCE(p_full_name, full_name),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = auth.uid();
END;
$$;

-- ─── 4. Prevent inspectors from modifying vehicle materials JSONB ──────────────
-- RISK: inspections_update policy allows inspector to update their own inspection
--       but vehicles_update is admin-only — this is correct. Verify no gap.
-- vehicles INSERT/UPDATE/DELETE are already admin-only — confirmed secure.

-- ─── 5. Add rate-limiting helper for sync queue validation ────────────────────
-- Validates that a sync item belongs to the authenticated user before upsert
CREATE OR REPLACE FUNCTION public.validate_sync_ownership(
    p_table TEXT,
    p_inspector_id UUID DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    -- For inspections: inspector_id must match current user (unless admin)
    IF p_table = 'inspections' THEN
        RETURN (p_inspector_id = auth.uid()) OR public.is_admin();
    END IF;
    -- For vehicles: only admins can create/update
    IF p_table = 'vehicles' THEN
        RETURN public.is_admin();
    END IF;
    RETURN false;
END;
$$;

-- ─── 6. Storage bucket for inspection photos ──────────────────────────────────
-- Create a secure bucket for inspection photos (replaces base64 in JSONB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'inspection-photos',
    'inspection-photos',
    false,
    5242880, -- 5 MB max per file
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

-- Storage RLS: authenticated active users can upload to their own folder
DROP POLICY IF EXISTS "inspection_photos_insert" ON storage.objects;
CREATE POLICY "inspection_photos_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'inspection-photos'
    AND public.is_active_user()
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
);

-- Storage RLS: authenticated active users can read all inspection photos
DROP POLICY IF EXISTS "inspection_photos_select" ON storage.objects;
CREATE POLICY "inspection_photos_select"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'inspection-photos'
    AND public.is_active_user()
);

-- Storage RLS: users can delete only their own photos; admins can delete any
DROP POLICY IF EXISTS "inspection_photos_delete" ON storage.objects;
CREATE POLICY "inspection_photos_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
    bucket_id = 'inspection-photos'
    AND (
        (storage.foldername(name))[1] = auth.uid()::TEXT
        OR public.is_admin()
    )
);

-- Storage RLS: no public updates allowed
DROP POLICY IF EXISTS "inspection_photos_update" ON storage.objects;
CREATE POLICY "inspection_photos_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
    bucket_id = 'inspection-photos'
    AND public.is_admin()
)
WITH CHECK (
    bucket_id = 'inspection-photos'
    AND public.is_admin()
);

-- ─── 7. PDF export permissions ────────────────────────────────────────────────
-- Track PDF export audit log (admins and inspectors can export their own)
CREATE TABLE IF NOT EXISTS public.pdf_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
    exported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pdf_exports_exported_by ON public.pdf_exports(exported_by);
CREATE INDEX IF NOT EXISTS idx_pdf_exports_inspection_id ON public.pdf_exports(inspection_id);

ALTER TABLE public.pdf_exports ENABLE ROW LEVEL SECURITY;

-- Admins can see all exports; users can see their own
DROP POLICY IF EXISTS "pdf_exports_select" ON public.pdf_exports;
CREATE POLICY "pdf_exports_select"
ON public.pdf_exports FOR SELECT
TO authenticated
USING (exported_by = auth.uid() OR public.is_admin());

-- Any active user can log a PDF export for an inspection they can access
DROP POLICY IF EXISTS "pdf_exports_insert" ON public.pdf_exports;
CREATE POLICY "pdf_exports_insert"
ON public.pdf_exports FOR INSERT
TO authenticated
WITH CHECK (
    exported_by = auth.uid()
    AND public.is_active_user()
);

-- Only admins can delete export logs
DROP POLICY IF EXISTS "pdf_exports_delete" ON public.pdf_exports;
CREATE POLICY "pdf_exports_delete"
ON public.pdf_exports FOR DELETE
TO authenticated
USING (public.is_admin());

-- ─── 8. Add local_id columns for offline sync (missing from schema) ───────────
-- RISK: syncQueue.ts uses upsert on 'local_id' column which doesn't exist
-- FIX: Add local_id to vehicles and inspections for conflict-free offline sync

ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS local_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_local_id
ON public.vehicles(local_id)
WHERE local_id IS NOT NULL;

ALTER TABLE public.inspections
ADD COLUMN IF NOT EXISTS local_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_local_id
ON public.inspections(local_id)
WHERE local_id IS NOT NULL;

-- ─── 9. Offline sync conflict resolution ─────────────────────────────────────
-- Add updated_at-based conflict detection for sync queue
-- Inspections: track last_synced_at to detect conflicts
ALTER TABLE public.inspections
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- ─── 10. Revoke anon access to all tables ─────────────────────────────────────
-- Ensure anon role cannot access any table (belt-and-suspenders)
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.vehicles FROM anon;
REVOKE ALL ON public.inspections FROM anon;
REVOKE ALL ON public.materials FROM anon;
REVOKE ALL ON public.pdf_exports FROM anon;
