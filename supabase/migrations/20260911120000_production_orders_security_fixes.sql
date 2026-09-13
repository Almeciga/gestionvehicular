-- ============================================================
-- Production Orders — Security & order-number fixes
-- (new migration; run AFTER the original production orders migration)
-- ============================================================

-- 1. current_app_role(): never returns NULL (returns '' instead) and ignores inactive users.
--    Fixes: users without a profile could pass the RPC permission checks.
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role::text FROM public.profiles WHERE id = auth.uid() AND is_active = true),
    ''
  );
$$;

-- 2. Lock the order-number counter table (only the trigger may touch it).
--    Create the table if the base migration hasn't run yet (idempotent).
CREATE TABLE IF NOT EXISTS public.po_order_counter (
  year     int PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
ALTER TABLE public.po_order_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.po_order_counter FROM anon, authenticated;

-- 3. Order number: generate only for truly new orders, always server-side.
--    Fixes: every sync (upsert) was consuming/changing the order number.
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int;
  v_seq  int;
BEGIN
  -- Upsert of an order that already exists: do not generate a new number
  IF EXISTS (SELECT 1 FROM public.production_orders WHERE id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.fecha, CURRENT_DATE))::int;

  INSERT INTO public.po_order_counter (year, last_seq)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_seq = po_order_counter.last_seq + 1
  RETURNING last_seq INTO v_seq;

  NEW.numero_orden := 'OP-' || v_year::text || '-' || LPAD(v_seq::text, 4, '0');
  RETURN NEW;
END;
$$;

-- 4. Protect status, approval fields and order number from direct edits by app users.
--    Only the po_* RPC functions (SECURITY DEFINER) can change the status.
--    NOTE: this function must NOT be SECURITY DEFINER (it relies on current_user).
CREATE OR REPLACE FUNCTION public.po_protect_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW; -- called from an RPC / admin SQL: allowed
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

DROP TRIGGER IF EXISTS trg_po_protect_fields ON public.production_orders;
CREATE TRIGGER trg_po_protect_fields
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.po_protect_fields();

-- 5. Orders can only be edited while in 'borrador' or 'rechazada'.
DROP POLICY IF EXISTS "po_update" ON public.production_orders;
CREATE POLICY "po_update" ON public.production_orders FOR UPDATE
  USING (
    public.current_app_role() IN ('admin','comercial')
    AND status IN ('borrador','rechazada')
  )
  WITH CHECK (public.current_app_role() IN ('admin','comercial'));

-- 6. Pieces can only be added/changed/removed while the order is editable.
DROP POLICY IF EXISTS "poi_insert" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_update" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_delete" ON public.production_order_items;

CREATE POLICY "poi_insert" ON public.production_order_items FOR INSERT
  WITH CHECK (
    public.current_app_role() IN ('admin','comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador','rechazada'))
  );

CREATE POLICY "poi_update" ON public.production_order_items FOR UPDATE
  USING (
    public.current_app_role() IN ('admin','comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador','rechazada'))
  )
  WITH CHECK (
    public.current_app_role() IN ('admin','comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador','rechazada'))
  );

CREATE POLICY "poi_delete" ON public.production_order_items FOR DELETE
  USING (
    public.current_app_role() IN ('admin','comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador','rechazada'))
  );

-- 7. Harden SECURITY DEFINER functions: fixed search_path, only logged-in users can call them.
ALTER FUNCTION public.po_submit_order(uuid)           SET search_path = public;
ALTER FUNCTION public.po_approve_order(uuid)          SET search_path = public;
ALTER FUNCTION public.po_reject_order(uuid, text)     SET search_path = public;
ALTER FUNCTION public.po_start_production(uuid)       SET search_path = public;
ALTER FUNCTION public.po_finish_order(uuid)           SET search_path = public;
ALTER FUNCTION public.po_dispatch_order(uuid)         SET search_path = public;
ALTER FUNCTION public.po_cancel_order(uuid, text)     SET search_path = public;
ALTER FUNCTION public.po_reopen_order(uuid)           SET search_path = public;

REVOKE EXECUTE ON FUNCTION
  public.po_submit_order(uuid), public.po_approve_order(uuid), public.po_reject_order(uuid, text),
  public.po_start_production(uuid), public.po_finish_order(uuid), public.po_dispatch_order(uuid),
  public.po_cancel_order(uuid, text), public.po_reopen_order(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.po_submit_order(uuid), public.po_approve_order(uuid), public.po_reject_order(uuid, text),
  public.po_start_production(uuid), public.po_finish_order(uuid), public.po_dispatch_order(uuid),
  public.po_cancel_order(uuid, text), public.po_reopen_order(uuid)
TO authenticated;

-- 8. Indexes for list filters and incremental sync.
CREATE INDEX IF NOT EXISTS idx_production_orders_status     ON public.production_orders (status);
CREATE INDEX IF NOT EXISTS idx_production_orders_updated_at ON public.production_orders (updated_at);
