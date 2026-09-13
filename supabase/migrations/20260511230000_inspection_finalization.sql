-- ============================================================
-- Inspection finalization & legal evidence columns
-- ============================================================

-- Add finalization/locking columns to inspections
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS creation_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS finalization_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Unique index on local_id for upsert deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_inspections_local_id ON public.inspections(local_id) WHERE local_id IS NOT NULL;

-- Index for locked inspections query
CREATE INDEX IF NOT EXISTS idx_inspections_is_locked ON public.inspections(is_locked);
CREATE INDEX IF NOT EXISTS idx_inspections_status ON public.inspections(status);

-- ─── RLS: Prevent inspector from editing locked inspections ───────────────────

-- Drop old update policy and replace with lock-aware version
DROP POLICY IF EXISTS "inspections_update_own_or_admin" ON public.inspections;

CREATE POLICY "inspections_update_own_or_admin"
ON public.inspections FOR UPDATE
TO authenticated
USING (
  -- Admin can always update
  public.is_admin()
  OR
  -- Inspector can only update their own non-locked inspections
  (inspector_id = auth.uid() AND is_locked = false)
)
WITH CHECK (
  public.is_admin()
  OR
  (inspector_id = auth.uid() AND is_locked = false)
);

-- ─── Audit log table for inspection modifications ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.inspection_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created' | 'updated' | 'finalized' | 'unlocked' | 'pdf_generated'
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_log_inspection_id ON public.inspection_audit_log(inspection_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_by ON public.inspection_audit_log(performed_by);

ALTER TABLE public.inspection_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select_admin" ON public.inspection_audit_log;
CREATE POLICY "audit_log_select_admin"
ON public.inspection_audit_log FOR SELECT
TO authenticated
USING (public.is_admin() OR performed_by = auth.uid());

DROP POLICY IF EXISTS "audit_log_insert_active" ON public.inspection_audit_log;
CREATE POLICY "audit_log_insert_active"
ON public.inspection_audit_log FOR INSERT
TO authenticated
WITH CHECK (public.is_active_user());
