-- ============================================================
-- Production Orders — Fix po_protect_fields trigger current_user bug
-- Self-contained: creates all prerequisites if they don't exist yet.
-- Safe to run after 20260911000001 and 20260911120000, or standalone.
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

-- ============================================================
-- PREREQUISITES — create tables/functions only if missing
-- ============================================================

-- profiles.role constraint (allow 'comercial')
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'inspector', 'comercial'));

-- current_app_role() — never returns NULL, ignores inactive users
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

-- Catalog tables
CREATE TABLE IF NOT EXISTS public.po_clientes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  pais       text,
  activo     boolean NOT NULL DEFAULT true,
  orden      int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.po_modelos_vehiculo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  activo     boolean NOT NULL DEFAULT true,
  orden      int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.po_niveles_nij (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  activo     boolean NOT NULL DEFAULT true,
  orden      int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.po_formas_pago (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  activo     boolean NOT NULL DEFAULT true,
  orden      int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.po_incoterms (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  activo     boolean NOT NULL DEFAULT true,
  orden      int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.po_piezas_vidrio (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text NOT NULL,
  nombre      text NOT NULL UNIQUE,
  abreviatura text NOT NULL,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.po_tipos_marcacion (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL UNIQUE,
  activo     boolean NOT NULL DEFAULT true,
  orden      int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Order number counter
CREATE TABLE IF NOT EXISTS public.po_order_counter (
  year     int PRIMARY KEY,
  last_seq int NOT NULL DEFAULT 0
);
ALTER TABLE public.po_order_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.po_order_counter FROM anon, authenticated;

-- production_orders
CREATE TABLE IF NOT EXISTS public.production_orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_orden       text UNIQUE,
  fecha              date NOT NULL DEFAULT CURRENT_DATE,
  cliente_id         uuid REFERENCES public.po_clientes(id),
  cliente_nombre     text,
  pais               text NOT NULL DEFAULT '',
  modelo_id          uuid REFERENCES public.po_modelos_vehiculo(id),
  modelo_nombre      text,
  nivel_nij_id       uuid REFERENCES public.po_niveles_nij(id),
  nivel_nij_nombre   text,
  forma_pago_id      uuid REFERENCES public.po_formas_pago(id),
  forma_pago_nombre  text,
  incoterm_id        uuid REFERENCES public.po_incoterms(id),
  incoterm_nombre    text,
  cantidad_vehiculos int NOT NULL DEFAULT 1 CHECK (cantidad_vehiculos >= 1),
  observaciones      text,
  status             text NOT NULL DEFAULT 'borrador'
                       CHECK (status IN ('borrador','pendiente_aprobacion','rechazada','aprobada','en_produccion','terminada','despachada','cancelada')),
  total_piezas       int NOT NULL DEFAULT 0,
  rejection_reason   text,
  submitted_at       timestamptz,
  submitted_by       uuid,
  approved_at        timestamptz,
  approved_by        uuid,
  rejected_at        timestamptz,
  rejected_by        uuid,
  cancelled_at       timestamptz,
  cancelled_by       uuid,
  version            int NOT NULL DEFAULT 1,
  created_by         uuid,
  created_by_name    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- production_order_items
CREATE TABLE IF NOT EXISTS public.production_order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              uuid NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  linea                 int,
  pieza_id              uuid REFERENCES public.po_piezas_vidrio(id),
  pieza_nombre          text,
  codigo                text,
  cantidad              int NOT NULL DEFAULT 1 CHECK (cantidad >= 1),
  nivel_nij_id          uuid REFERENCES public.po_niveles_nij(id),
  nivel_nij_nombre      text,
  lleva_marcacion       boolean NOT NULL DEFAULT false,
  tipo_marcacion_id     uuid REFERENCES public.po_tipos_marcacion(id),
  tipo_marcacion_nombre text,
  observaciones         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, pieza_id)
);

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'po_clientes','po_modelos_vehiculo','po_niveles_nij','po_formas_pago',
    'po_incoterms','po_piezas_vidrio','po_tipos_marcacion',
    'production_orders','production_order_items'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_updated_at ON public.%I;
       CREATE TRIGGER trg_set_updated_at
         BEFORE UPDATE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- version increment trigger
CREATE OR REPLACE FUNCTION public.increment_po_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version = OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_po_version ON public.production_orders;
CREATE TRIGGER trg_increment_po_version
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.increment_po_version();

-- Order number generation
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
  IF NEW.numero_orden IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trg_generate_order_number ON public.production_orders;
CREATE TRIGGER trg_generate_order_number
  BEFORE INSERT ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.generate_order_number();

-- RLS for production_orders
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "po_select" ON public.production_orders;
CREATE POLICY "po_select" ON public.production_orders FOR SELECT
  USING (public.current_app_role() IN ('admin', 'comercial', 'inspector'));

DROP POLICY IF EXISTS "po_insert" ON public.production_orders;
CREATE POLICY "po_insert" ON public.production_orders FOR INSERT
  WITH CHECK (public.current_app_role() IN ('admin', 'comercial'));

DROP POLICY IF EXISTS "po_update" ON public.production_orders;
CREATE POLICY "po_update" ON public.production_orders FOR UPDATE
  USING (
    public.current_app_role() IN ('admin', 'comercial')
    AND status IN ('borrador', 'rechazada')
  )
  WITH CHECK (public.current_app_role() IN ('admin', 'comercial'));

DROP POLICY IF EXISTS "po_delete" ON public.production_orders;
CREATE POLICY "po_delete" ON public.production_orders FOR DELETE
  USING (
    public.current_app_role() = 'admin'
    AND status = 'borrador'
  );

DROP POLICY IF EXISTS "poi_select" ON public.production_order_items;
CREATE POLICY "poi_select" ON public.production_order_items FOR SELECT
  USING (public.current_app_role() IN ('admin', 'comercial', 'inspector'));

DROP POLICY IF EXISTS "poi_insert" ON public.production_order_items;
CREATE POLICY "poi_insert" ON public.production_order_items FOR INSERT
  WITH CHECK (
    public.current_app_role() IN ('admin', 'comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador', 'rechazada'))
  );

DROP POLICY IF EXISTS "poi_update" ON public.production_order_items;
CREATE POLICY "poi_update" ON public.production_order_items FOR UPDATE
  USING (
    public.current_app_role() IN ('admin', 'comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador', 'rechazada'))
  )
  WITH CHECK (
    public.current_app_role() IN ('admin', 'comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador', 'rechazada'))
  );

DROP POLICY IF EXISTS "poi_delete" ON public.production_order_items;
CREATE POLICY "poi_delete" ON public.production_order_items FOR DELETE
  USING (
    public.current_app_role() IN ('admin', 'comercial')
    AND EXISTS (SELECT 1 FROM public.production_orders po
                WHERE po.id = order_id AND po.status IN ('borrador', 'rechazada'))
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_production_orders_status     ON public.production_orders (status);
CREATE INDEX IF NOT EXISTS idx_production_orders_updated_at ON public.production_orders (updated_at);

-- ============================================================
-- 1. Helper: set/get the RPC bypass flag via a session-local GUC.
-- ============================================================
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

-- ============================================================
-- 2. Rewrite po_protect_fields to use the session flag instead of current_user.
-- ============================================================
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

DROP TRIGGER IF EXISTS trg_po_protect_fields ON public.production_orders;
CREATE TRIGGER trg_po_protect_fields
  BEFORE INSERT OR UPDATE ON public.production_orders
  FOR EACH ROW EXECUTE FUNCTION public.po_protect_fields();

-- ============================================================
-- 3. SECURITY DEFINER RPCs — each calls po_set_rpc_context() before DML.
-- ============================================================

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

-- ============================================================
-- 4. Grants
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.po_set_rpc_context() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.po_set_rpc_context() TO authenticated;

REVOKE EXECUTE ON FUNCTION
  public.po_submit_order(uuid), public.po_approve_order(uuid),
  public.po_reject_order(uuid, text), public.po_start_production(uuid),
  public.po_finish_order(uuid), public.po_dispatch_order(uuid),
  public.po_cancel_order(uuid, text), public.po_reopen_order(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.po_submit_order(uuid), public.po_approve_order(uuid),
  public.po_reject_order(uuid, text), public.po_start_production(uuid),
  public.po_finish_order(uuid), public.po_dispatch_order(uuid),
  public.po_cancel_order(uuid, text), public.po_reopen_order(uuid)
TO authenticated;
