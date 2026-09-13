-- ============================================================
-- Ballistic Technology: Hardened PDF exports + audit logging
-- ============================================================

-- Ensure pdf_exports table has all required columns for immutable snapshots
ALTER TABLE public.pdf_exports
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_regeneration BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS generation_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pdf_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'failed', 'corrupted'));

-- Backfill generated_by and generated_at from existing exported_by / exported_at
UPDATE public.pdf_exports
SET
  generated_by = exported_by,
  generated_at = exported_at
WHERE generated_by IS NULL;

-- Index for fast lookup by inspection
CREATE INDEX IF NOT EXISTS idx_pdf_exports_inspection_id ON public.pdf_exports(inspection_id);
CREATE INDEX IF NOT EXISTS idx_pdf_exports_generated_at ON public.pdf_exports(generated_at DESC);

-- Ensure inspection_audit_log has pdf_generated action support
-- (action column is TEXT so no schema change needed, just ensure index)
CREATE INDEX IF NOT EXISTS idx_audit_log_pdf_generated ON public.inspection_audit_log(action)
  WHERE action = 'pdf_generated';

-- ─── View: PDF generation history per inspection ──────────────────────────────
CREATE OR REPLACE VIEW public.pdf_generation_history AS
SELECT
  pe.id,
  pe.inspection_id,
  pe.generated_at,
  pe.filename,
  pe.inspection_placa,
  pe.is_regeneration,
  pe.generation_number,
  pe.status,
  p.full_name AS generated_by_name,
  p.email AS generated_by_email,
  p.role AS generated_by_role
FROM public.pdf_exports pe
LEFT JOIN public.profiles p ON p.id = pe.generated_by
ORDER BY pe.generated_at DESC;

-- RLS: admins see all, inspectors see their own
DROP POLICY IF EXISTS "pdf_exports_select" ON public.pdf_exports;
CREATE POLICY "pdf_exports_select"
ON public.pdf_exports FOR SELECT
TO authenticated
USING (public.is_admin() OR generated_by = auth.uid() OR exported_by = auth.uid());

DROP POLICY IF EXISTS "pdf_exports_insert" ON public.pdf_exports;
CREATE POLICY "pdf_exports_insert"
ON public.pdf_exports FOR INSERT
TO authenticated
WITH CHECK (generated_by = auth.uid() OR exported_by = auth.uid());

-- ─── Function: log PDF generation with audit trail ────────────────────────────
CREATE OR REPLACE FUNCTION public.log_pdf_generation(
  p_inspection_id UUID,
  p_filename TEXT,
  p_placa TEXT,
  p_is_regeneration BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_export_id UUID;
  v_gen_number INTEGER;
BEGIN
  -- Only admins can regenerate finalized PDFs
  IF p_is_regeneration AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can regenerate finalized PDFs';
  END IF;

  -- Get current generation count
  SELECT COALESCE(MAX(generation_number), 0) + 1
  INTO v_gen_number
  FROM public.pdf_exports
  WHERE inspection_id = p_inspection_id;

  INSERT INTO public.pdf_exports (
    inspection_id,
    generated_by,
    generated_at,
    filename,
    inspection_placa,
    is_regeneration,
    generation_number,
    status
  ) VALUES (
    p_inspection_id,
    auth.uid(),
    CURRENT_TIMESTAMP,
    p_filename,
    p_placa,
    p_is_regeneration,
    v_gen_number,
    'generated'
  )
  RETURNING id INTO v_export_id;

  -- Log to audit trail
  INSERT INTO public.inspection_audit_log (
    inspection_id,
    action,
    performed_by,
    details
  ) VALUES (
    p_inspection_id,
    'pdf_generated',
    auth.uid(),
    jsonb_build_object(
      'filename', p_filename,
      'is_regeneration', p_is_regeneration,
      'generation_number', v_gen_number,
      'timestamp', CURRENT_TIMESTAMP
    )
  );

  RETURN v_export_id;
END;
$$;
