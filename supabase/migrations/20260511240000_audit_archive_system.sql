-- ============================================================
-- Ballistic Technology: Audit system, archived state, inspector_name
-- ============================================================

-- Add inspector_name column to inspections for legal identity record
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS inspector_name TEXT,
  ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add archived status support (status can now be 'borrador'|'activo'|'completado'|'finalizado'|'archivado')
-- No schema change needed — status is TEXT, just enforce in app logic

-- Ensure inspection_audit_log has all needed columns
ALTER TABLE public.inspection_audit_log
  ADD COLUMN IF NOT EXISTS inspection_local_id TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Index for inspector activity history queries
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON public.inspection_audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.inspection_audit_log(action);

-- ─── Admin activity history view ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.admin_activity_view AS
SELECT
  al.id,
  al.action,
  al.performed_at,
  al.details,
  al.inspection_id,
  p.full_name AS performed_by_name,
  p.email AS performed_by_email,
  p.role AS performed_by_role,
  i.placa AS inspection_placa,
  i.marca AS inspection_marca,
  i.modelo AS inspection_modelo
FROM public.inspection_audit_log al
LEFT JOIN public.profiles p ON p.id = al.performed_by
LEFT JOIN public.inspections i ON i.id = al.inspection_id
ORDER BY al.performed_at DESC;

-- RLS on view: only admins can see full activity
DROP POLICY IF EXISTS "admin_activity_view_select" ON public.inspection_audit_log;
CREATE POLICY "admin_activity_view_select"
ON public.inspection_audit_log FOR SELECT
TO authenticated
USING (public.is_admin() OR performed_by = auth.uid());

-- ─── Function: log inspection action ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_inspection_action(
  p_inspection_id UUID,
  p_action TEXT,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_local_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.inspection_audit_log (
    inspection_id,
    action,
    performed_by,
    details,
    inspection_local_id
  ) VALUES (
    p_inspection_id,
    p_action,
    auth.uid(),
    p_details,
    p_local_id
  )
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;

-- ─── Function: admin unlock inspection ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_unlock_inspection(
  p_inspection_id UUID,
  p_reason TEXT DEFAULT 'Admin unlock'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only admins can unlock
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can unlock inspections';
  END IF;

  UPDATE public.inspections
  SET
    is_locked = false,
    status = 'activo',
    unlocked_at = CURRENT_TIMESTAMP,
    unlocked_by = auth.uid(),
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_inspection_id;

  -- Log the unlock action
  INSERT INTO public.inspection_audit_log (
    inspection_id,
    action,
    performed_by,
    details
  ) VALUES (
    p_inspection_id,
    'unlocked',
    auth.uid(),
    jsonb_build_object('reason', p_reason, 'timestamp', CURRENT_TIMESTAMP)
  );

  RETURN true;
END;
$$;

-- ─── Function: finalize inspection ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_inspection(
  p_inspection_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Active users can finalize their own inspections
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Unauthorized: inactive user';
  END IF;

  UPDATE public.inspections
  SET
    is_locked = true,
    status = 'finalizado',
    finalized_at = CURRENT_TIMESTAMP,
    finalized_by = auth.uid(),
    finalization_timestamp = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_inspection_id
    AND (inspector_id = auth.uid() OR public.is_admin());

  -- Log finalization
  INSERT INTO public.inspection_audit_log (
    inspection_id,
    action,
    performed_by,
    details
  ) VALUES (
    p_inspection_id,
    'finalized',
    auth.uid(),
    jsonb_build_object('timestamp', CURRENT_TIMESTAMP)
  );

  RETURN true;
END;
$$;

-- ─── Function: archive inspection (admin only) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_inspection(
  p_inspection_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only admins can archive inspections';
  END IF;

  UPDATE public.inspections
  SET
    status = 'archivado',
    updated_at = CURRENT_TIMESTAMP
  WHERE id = p_inspection_id;

  INSERT INTO public.inspection_audit_log (
    inspection_id,
    action,
    performed_by,
    details
  ) VALUES (
    p_inspection_id,
    'archived',
    auth.uid(),
    jsonb_build_object('timestamp', CURRENT_TIMESTAMP)
  );

  RETURN true;
END;
$$;

-- ─── Trigger: auto-log inspection creation ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_log_inspection_create()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.inspection_audit_log (
    inspection_id,
    action,
    performed_by,
    details,
    inspection_local_id
  ) VALUES (
    NEW.id,
    'created',
    NEW.inspector_id,
    jsonb_build_object('placa', NEW.placa, 'status', NEW.status, 'local_id', NEW.local_id),
    NEW.local_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_log_inspection_create ON public.inspections;
CREATE TRIGGER trg_auto_log_inspection_create
  AFTER INSERT ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_log_inspection_create();

-- ─── Trigger: auto-log inspection updates ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_log_inspection_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only log meaningful changes
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.is_locked IS DISTINCT FROM NEW.is_locked THEN
    INSERT INTO public.inspection_audit_log (
      inspection_id,
      action,
      performed_by,
      details
    ) VALUES (
      NEW.id,
      CASE
        WHEN NEW.is_locked = true AND OLD.is_locked = false THEN 'finalized'
        WHEN NEW.is_locked = false AND OLD.is_locked = true THEN 'unlocked'
        WHEN NEW.status = 'archivado' THEN 'archived'
        ELSE 'updated'
      END,
      auth.uid(),
      jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status,
        'old_locked', OLD.is_locked,
        'new_locked', NEW.is_locked,
        'timestamp', CURRENT_TIMESTAMP
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_log_inspection_update ON public.inspections;
CREATE TRIGGER trg_auto_log_inspection_update
  AFTER UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_log_inspection_update();
