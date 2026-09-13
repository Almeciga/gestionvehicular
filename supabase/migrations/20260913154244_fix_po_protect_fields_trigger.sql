-- ============================================================
-- Production Orders — Fix po_protect_fields trigger current_user bug
-- (new migration; run AFTER 20260911120000_production_orders_security_fixes.sql)
-- ============================================================
--
-- ROOT CAUSE:
--   In Supabase's PostgREST layer, current_user inside a trigger body is
--   'authenticator' (the session owner role), NOT 'authenticated' or 'anon'.
--   The original check:
--     IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW;
--   always evaluates to TRUE for normal app users, causing the trigger to
--   skip all field protection and return NEW unchanged — defeating its purpose.
--
-- FIX:
--   Replace the current_user check with a session-variable flag.
--   SECURITY DEFINER RPCs set the flag before their DML; the trigger reads it.
--   When the flag is absent (normal app INSERT/UPDATE), protection is enforced.
-- ============================================================

-- 1. Helper: set/get the RPC bypass flag via a session-local GUC.
CREATE OR REPLACE FUNCTION public.po_set_rpc_context()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.po_rpc_context', 'true', true); -- true = transaction-local
END;
$$;

-- 2. Rewrite po_protect_fields to use the session flag instead of current_user.
CREATE OR REPLACE FUNCTION public.po_protect_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- If called from a SECURITY DEFINER RPC (which sets the flag), allow all changes.
  IF current_setting('app.po_rpc_context', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status        := 'borrador';
    NEW.created_by    := auth.uid();
    NEW.submitted_at  := NULL; NEW.submitted_by := NULL;
    NEW.approved_at   := NULL; NEW.approved_by  := NULL;
    NEW.rejected_at   := NULL; NEW.rejected_by  := NULL;
    NEW.cancelled_at  := NULL; NEW.cancelled_by := NULL;
    NEW.rejection_reason := NULL;
  ELSE
    NEW.numero_orden  := COALESCE(OLD.numero_orden, NEW.numero_orden);
    NEW.status        := OLD.status;
    NEW.created_by    := OLD.created_by;
    NEW.created_at    := OLD.created_at;
    NEW.submitted_at  := OLD.submitted_at; NEW.submitted_by := OLD.submitted_by;
    NEW.approved_at   := OLD.approved_at;  NEW.approved_by  := OLD.approved_by;
    NEW.rejected_at   := OLD.rejected_at;  NEW.rejected_by  := OLD.rejected_by;
    NEW.cancelled_at  := OLD.cancelled_at; NEW.cancelled_by := OLD.cancelled_by;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger (no change needed, but ensures it uses the updated function).
DROP TRIGGER IF EXISTS trg_po_protect_fields ON public.production_orders;
CREATE TRIGGER trg_po_protect_fields
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.po_protect_fields();

-- 3. Inject po_set_rpc_context() call into every SECURITY DEFINER RPC so they
--    bypass the field-protection trigger correctly.
--    We recreate only the body preamble; the rest of each function is unchanged.

-- po_submit_order
CREATE OR REPLACE FUNCTION public.po_submit_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin', 'comercial') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status       = 'enviada',
      submitted_at = now(),
      submitted_by = auth.uid(),
      updated_at   = now()
  WHERE id = p_order_id AND status IN ('borrador', 'rechazada');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in editable status';
  END IF;
END;
$$;

-- po_approve_order
CREATE OR REPLACE FUNCTION public.po_approve_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status      = 'aprobada',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at  = now()
  WHERE id = p_order_id AND status = 'enviada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in submitted status';
  END IF;
END;
$$;

-- po_reject_order
CREATE OR REPLACE FUNCTION public.po_reject_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status           = 'rechazada',
      rejected_at      = now(),
      rejected_by      = auth.uid(),
      rejection_reason = p_reason,
      updated_at       = now()
  WHERE id = p_order_id AND status = 'enviada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in submitted status';
  END IF;
END;
$$;

-- po_start_production
CREATE OR REPLACE FUNCTION public.po_start_production(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status     = 'en_produccion',
      updated_at = now()
  WHERE id = p_order_id AND status = 'aprobada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in approved status';
  END IF;
END;
$$;

-- po_finish_order
CREATE OR REPLACE FUNCTION public.po_finish_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status     = 'terminada',
      updated_at = now()
  WHERE id = p_order_id AND status = 'en_produccion';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in production status';
  END IF;
END;
$$;

-- po_dispatch_order
CREATE OR REPLACE FUNCTION public.po_dispatch_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status     = 'despachada',
      updated_at = now()
  WHERE id = p_order_id AND status = 'terminada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in finished status';
  END IF;
END;
$$;

-- po_cancel_order
CREATE OR REPLACE FUNCTION public.po_cancel_order(p_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status           = 'cancelada',
      cancelled_at     = now(),
      cancelled_by     = auth.uid(),
      rejection_reason = p_reason,
      updated_at       = now()
  WHERE id = p_order_id AND status NOT IN ('cancelada', 'despachada');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or already in terminal status';
  END IF;
END;
$$;

-- po_reopen_order
CREATE OR REPLACE FUNCTION public.po_reopen_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.po_set_rpc_context();
  UPDATE public.production_orders
  SET status           = 'borrador',
      rejected_at      = NULL,
      rejected_by      = NULL,
      rejection_reason = NULL,
      updated_at       = now()
  WHERE id = p_order_id AND status = 'rechazada';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in rejected status';
  END IF;
END;
$$;

-- Grant execute on the new helper (only authenticated users need it indirectly via RPCs)
REVOKE EXECUTE ON FUNCTION public.po_set_rpc_context() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.po_set_rpc_context() TO authenticated;
