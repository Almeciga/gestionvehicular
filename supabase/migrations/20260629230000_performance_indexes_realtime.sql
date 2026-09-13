-- ============================================================
-- ARCHITECTURAL REFACTOR: Performance Indexes + Realtime Config
-- Adds missing indexes for main tables, disables Realtime for
-- secondary tables, adds updated_at columns where missing.
-- ============================================================

-- ─── Additional indexes for main tables ──────────────────────────────────────

-- profiles: ensure all lookup indexes exist
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON public.profiles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- vehicles: performance indexes
CREATE INDEX IF NOT EXISTS idx_vehicles_updated_at ON public.vehicles(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_created_at ON public.vehicles(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicles_marca ON public.vehicles(marca);
CREATE INDEX IF NOT EXISTS idx_vehicles_propietario ON public.vehicles(propietario);

-- materials: performance indexes
CREATE INDEX IF NOT EXISTS idx_materials_updated_at ON public.materials(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_created_at ON public.materials(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_materials_nombre ON public.materials(nombre);
CREATE INDEX IF NOT EXISTS idx_materials_created_by ON public.materials(created_by);

-- inspections: performance indexes
CREATE INDEX IF NOT EXISTS idx_inspections_updated_at ON public.inspections(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle_id ON public.inspections(placa);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections(status);
CREATE INDEX IF NOT EXISTS idx_inspections_created_at ON public.inspections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inspections_local_id ON public.inspections(local_id) WHERE local_id IS NOT NULL;

-- media_uploads: performance indexes
CREATE INDEX IF NOT EXISTS idx_media_uploads_uploaded_by ON public.media_uploads(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_uploads_uploaded_at ON public.media_uploads(uploaded_at DESC);

-- ─── Add local_id column to vehicles if missing ───────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_vehicles_local_id ON public.vehicles(local_id) WHERE local_id IS NOT NULL;

-- ─── Add updated_at to materials if missing ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'materials' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.materials ADD COLUMN updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
  END IF;
END $$;

-- ─── Ensure updated_at triggers exist on all main tables ─────────────────────

DROP TRIGGER IF EXISTS set_updated_at_profiles ON public.profiles;
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_vehicles ON public.vehicles;
CREATE TRIGGER set_updated_at_vehicles
  BEFORE UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_materials ON public.materials;
CREATE TRIGGER set_updated_at_materials
  BEFORE UPDATE ON public.materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_inspections ON public.inspections;
CREATE TRIGGER set_updated_at_inspections
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Disable Realtime for secondary tables ────────────────────────────────────
-- Only vehicles, materials, inspections should use Realtime.
-- Logs, exports, history, audit should NOT.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.inspection_audit_log;
  EXCEPTION WHEN undefined_object THEN NULL; WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.error_logs;
  EXCEPTION WHEN undefined_object THEN NULL; WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.pdf_exports;
  EXCEPTION WHEN undefined_object THEN NULL; WHEN others THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.pdf_generation_history;
  EXCEPTION WHEN undefined_object THEN NULL; WHEN others THEN NULL;
  END;
END $$;

-- Ensure main tables are in Realtime publication
DO $$
BEGIN
  -- Add main tables to realtime if not already present
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.materials;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inspections;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ─── Optimize is_admin() and is_active_user() — ensure they use auth.users ───
-- These should already be correct from previous migrations, but re-apply to be safe.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (
        raw_user_meta_data->>'role' = 'admin'
        OR raw_app_meta_data->>'role' = 'admin'
    )
)
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND (
        (raw_user_meta_data->>'is_active') IS DISTINCT FROM 'false'
    )
)
$$;

-- ─── RLS for error_logs: batch insert allowed, admin reads ───────────────────
-- (Ensure this is correct from previous migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'error_logs'
  ) THEN
    RAISE NOTICE 'error_logs table does not exist yet — skipping RLS setup';
  END IF;
END $$;
