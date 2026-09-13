-- ============================================================
-- Production Orders Module Migration
-- ============================================================

-- 1. Update profiles.role check constraint to allow 'comercial'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'inspector', 'comercial'));

-- 2. Helper function: current_app_role() — security definer, reads profiles.role
CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ============================================================
-- 3. Catalog Tables
-- ============================================================

-- po_clientes
CREATE TABLE IF NOT EXISTS public.po_clientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  pais        text,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- po_modelos_vehiculo
CREATE TABLE IF NOT EXISTS public.po_modelos_vehiculo (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- po_niveles_nij
CREATE TABLE IF NOT EXISTS public.po_niveles_nij (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- po_formas_pago
CREATE TABLE IF NOT EXISTS public.po_formas_pago (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- po_incoterms
CREATE TABLE IF NOT EXISTS public.po_incoterms (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- po_piezas_vidrio
CREATE TABLE IF NOT EXISTS public.po_piezas_vidrio (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL,
  nombre       text NOT NULL UNIQUE,
  abreviatura  text NOT NULL,
  activo       boolean NOT NULL DEFAULT true,
  orden        int,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- po_tipos_marcacion
CREATE TABLE IF NOT EXISTS public.po_tipos_marcacion (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL UNIQUE,
  activo      boolean NOT NULL DEFAULT true,
  orden       int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. Order Number Counter Table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.po_order_counter (
  year        int PRIMARY KEY,
  last_seq    int NOT NULL DEFAULT 0
);

-- ============================================================
-- 5. production_orders
-- ============================================================

CREATE TABLE IF NOT EXISTS public.production_orders (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_orden          text UNIQUE,
  fecha                 date NOT NULL DEFAULT CURRENT_DATE,
  cliente_id            uuid REFERENCES public.po_clientes(id),
  cliente_nombre        text,
  pais                  text NOT NULL DEFAULT '',
  modelo_id             uuid REFERENCES public.po_modelos_vehiculo(id),
  modelo_nombre         text,
  nivel_nij_id          uuid REFERENCES public.po_niveles_nij(id),
  nivel_nij_nombre      text,
  forma_pago_id         uuid REFERENCES public.po_formas_pago(id),
  forma_pago_nombre     text,
  incoterm_id           uuid REFERENCES public.po_incoterms(id),
  incoterm_nombre       text,
  cantidad_vehiculos    int NOT NULL DEFAULT 1 CHECK (cantidad_vehiculos >= 1),
  observaciones         text,
  status                text NOT NULL DEFAULT 'borrador'
                          CHECK (status IN ('borrador','pendiente_aprobacion','rechazada','aprobada','en_produccion','terminada','despachada','cancelada')),
  total_piezas          int NOT NULL DEFAULT 0,
  rejection_reason      text,
  submitted_at          timestamptz,
  submitted_by          uuid,
  approved_at           timestamptz,
  approved_by           uuid,
  rejected_at           timestamptz,
  rejected_by           uuid,
  cancelled_at          timestamptz,
  cancelled_by          uuid,
  version               int NOT NULL DEFAULT 1,
  created_by            uuid,
  created_by_name       text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. production_order_items
-- ============================================================

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

-- ============================================================
-- 7. updated_at triggers
-- ============================================================

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

-- version increment trigger for production_orders
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

-- ============================================================
-- 8. Order Number Generation
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_year int;
  v_seq  int;
BEGIN
  -- Only assign when transitioning from NULL (first sync)
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

-- ============================================================
-- 9. RPC Status-Change Functions
-- ============================================================

-- po_submit_order
CREATE OR REPLACE FUNCTION public.po_submit_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role NOT IN ('admin','comercial') THEN
    RAISE EXCEPTION 'Sin permisos para enviar órdenes';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status NOT IN ('borrador','rechazada') THEN
    RAISE EXCEPTION 'Solo se pueden enviar órdenes en borrador o rechazadas';
  END IF;

  UPDATE public.production_orders
  SET status = 'pendiente_aprobacion',
      submitted_at = now(),
      submitted_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- po_approve_order
CREATE OR REPLACE FUNCTION public.po_approve_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden aprobar órdenes';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status <> 'pendiente_aprobacion' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar órdenes pendientes de aprobación';
  END IF;

  UPDATE public.production_orders
  SET status = 'aprobada',
      approved_at = now(),
      approved_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- po_reject_order
CREATE OR REPLACE FUNCTION public.po_reject_order(p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden rechazar órdenes';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status <> 'pendiente_aprobacion' THEN
    RAISE EXCEPTION 'Solo se pueden rechazar órdenes pendientes de aprobación';
  END IF;

  UPDATE public.production_orders
  SET status = 'rechazada',
      rejection_reason = p_reason,
      rejected_at = now(),
      rejected_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- po_start_production
CREATE OR REPLACE FUNCTION public.po_start_production(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden iniciar producción';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status <> 'aprobada' THEN
    RAISE EXCEPTION 'Solo se pueden iniciar órdenes aprobadas';
  END IF;

  UPDATE public.production_orders SET status = 'en_produccion' WHERE id = p_order_id;
END;
$$;

-- po_finish_order
CREATE OR REPLACE FUNCTION public.po_finish_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar órdenes como terminadas';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status <> 'en_produccion' THEN
    RAISE EXCEPTION 'Solo se pueden terminar órdenes en producción';
  END IF;

  UPDATE public.production_orders SET status = 'terminada' WHERE id = p_order_id;
END;
$$;

-- po_dispatch_order
CREATE OR REPLACE FUNCTION public.po_dispatch_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden despachar órdenes';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status <> 'terminada' THEN
    RAISE EXCEPTION 'Solo se pueden despachar órdenes terminadas';
  END IF;

  UPDATE public.production_orders SET status = 'despachada' WHERE id = p_order_id;
END;
$$;

-- po_cancel_order
CREATE OR REPLACE FUNCTION public.po_cancel_order(p_order_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden cancelar órdenes';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;
  IF v_status = 'despachada' THEN
    RAISE EXCEPTION 'No se pueden cancelar órdenes despachadas';
  END IF;

  UPDATE public.production_orders
  SET status = 'cancelada',
      rejection_reason = p_reason,
      cancelled_at = now(),
      cancelled_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

-- po_reopen_order (admin moves back one step)
CREATE OR REPLACE FUNCTION public.po_reopen_order(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role text;
  v_status text;
  v_prev_status text;
BEGIN
  v_role := public.current_app_role();
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo administradores pueden reabrir órdenes';
  END IF;

  SELECT status INTO v_status FROM public.production_orders WHERE id = p_order_id;

  v_prev_status := CASE v_status
    WHEN 'pendiente_aprobacion' THEN 'borrador'
    WHEN 'aprobada'             THEN 'pendiente_aprobacion'
    WHEN 'en_produccion'        THEN 'aprobada'
    WHEN 'terminada'            THEN 'en_produccion'
    WHEN 'cancelada'            THEN 'borrador'
    ELSE NULL
  END;

  IF v_prev_status IS NULL THEN
    RAISE EXCEPTION 'No se puede reabrir una orden en estado %', v_status;
  END IF;

  UPDATE public.production_orders SET status = v_prev_status WHERE id = p_order_id;
END;
$$;

-- ============================================================
-- 10. RLS Policies
-- ============================================================

ALTER TABLE public.po_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_modelos_vehiculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_niveles_nij ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_formas_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_incoterms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_piezas_vidrio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_tipos_marcacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;

-- Catalog tables: admin & comercial can read/write; inspector read-only
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'po_clientes','po_modelos_vehiculo','po_niveles_nij','po_formas_pago',
    'po_incoterms','po_piezas_vidrio','po_tipos_marcacion'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "catalog_select" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "catalog_insert" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "catalog_update" ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "catalog_delete" ON public.%I', tbl);

    EXECUTE format(
      'CREATE POLICY "catalog_select" ON public.%I FOR SELECT
       USING (public.current_app_role() IN (''admin'',''comercial'',''inspector''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "catalog_insert" ON public.%I FOR INSERT
       WITH CHECK (public.current_app_role() IN (''admin'',''comercial''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "catalog_update" ON public.%I FOR UPDATE
       USING (public.current_app_role() IN (''admin'',''comercial''))',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY "catalog_delete" ON public.%I FOR DELETE
       USING (public.current_app_role() = ''admin'')',
      tbl
    );
  END LOOP;
END;
$$;

-- production_orders RLS
DROP POLICY IF EXISTS "po_select" ON public.production_orders;
DROP POLICY IF EXISTS "po_insert" ON public.production_orders;
DROP POLICY IF EXISTS "po_update" ON public.production_orders;
DROP POLICY IF EXISTS "po_delete" ON public.production_orders;

CREATE POLICY "po_select" ON public.production_orders FOR SELECT
  USING (
    public.current_app_role() IN ('admin','comercial')
    OR (
      public.current_app_role() = 'inspector'
      AND status IN ('aprobada','en_produccion','terminada','despachada')
    )
  );

CREATE POLICY "po_insert" ON public.production_orders FOR INSERT
  WITH CHECK (public.current_app_role() IN ('admin','comercial'));

CREATE POLICY "po_update" ON public.production_orders FOR UPDATE
  USING (public.current_app_role() IN ('admin','comercial'));

CREATE POLICY "po_delete" ON public.production_orders FOR DELETE
  USING (
    public.current_app_role() = 'admin'
    AND status = 'borrador'
  );

-- production_order_items RLS
DROP POLICY IF EXISTS "poi_select" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_insert" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_update" ON public.production_order_items;
DROP POLICY IF EXISTS "poi_delete" ON public.production_order_items;

CREATE POLICY "poi_select" ON public.production_order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.production_orders po
      WHERE po.id = order_id
      AND (
        public.current_app_role() IN ('admin','comercial')
        OR (
          public.current_app_role() = 'inspector'
          AND po.status IN ('aprobada','en_produccion','terminada','despachada')
        )
      )
    )
  );

CREATE POLICY "poi_insert" ON public.production_order_items FOR INSERT
  WITH CHECK (public.current_app_role() IN ('admin','comercial'));

CREATE POLICY "poi_update" ON public.production_order_items FOR UPDATE
  USING (public.current_app_role() IN ('admin','comercial'));

CREATE POLICY "poi_delete" ON public.production_order_items FOR DELETE
  USING (public.current_app_role() IN ('admin','comercial'));

-- ============================================================
-- 11. Seed Data
-- ============================================================

-- NIJ Levels
INSERT INTO public.po_niveles_nij (nombre, orden) VALUES
  ('NIJ IIA - 13mm', 1),
  ('NIJ IIA - 14mm', 2),
  ('NIJ IIA - 16mm', 3),
  ('NIJ II - 18mm', 4),
  ('NIJ II - 19mm', 5),
  ('NIJ III-A - 19mm', 6),
  ('NIJ III-A - 20mm', 7),
  ('NIJ III-A - 22mm', 8),
  ('NIJ III-A - 23mm', 9),
  ('NIJ III-A - 24mm', 10),
  ('NIJ III-A - 25mm', 11),
  ('NIJ III-A - 28mm', 12),
  ('NIJ III-A - 30mm', 13),
  ('BR5 - 33mm', 14),
  ('BR5 - 35mm', 15),
  ('BR6 - 42mm', 16),
  ('BR6 - 45mm', 17),
  ('BR6 - 50mm', 18),
  ('BR7 - 75mm', 19)
ON CONFLICT (nombre) DO NOTHING;

-- Payment methods
INSERT INTO public.po_formas_pago (nombre, orden) VALUES
  ('100% CON LA ORDEN', 1),
  ('100% FINALIZAR PRODUCCIÓN', 2),
  ('50% CON LA ORDEN - 50% FINALIZAR PRODUCCIÓN', 3),
  ('90 DÍAS CREDITO', 4)
ON CONFLICT (nombre) DO NOTHING;

-- Incoterms
INSERT INTO public.po_incoterms (nombre, orden) VALUES
  ('CIF', 1),
  ('CPT', 2),
  ('FCA', 3),
  ('EXW', 4)
ON CONFLICT (nombre) DO NOTHING;

-- Marking types
INSERT INTO public.po_tipos_marcacion (nombre, orden) VALUES
  ('LOGO BALLISTIC TECHNOLOGY', 1),
  ('LOGO CLIENTE', 2),
  ('TRAZABILIDAD + FECHA', 3),
  ('NUMERO ORDEN CLIENTE', 4)
ON CONFLICT (nombre) DO NOTHING;

-- Clients
INSERT INTO public.po_clientes (nombre, pais) VALUES
  ('OLMAN LEDEZMA', 'COSTA RICA'),
  ('XTREME', 'COLOMBIA'),
  ('AUTO SAFE', 'EL SALVADOR'),
  ('ALTUM', 'ECUADOR'),
  ('BLINTECH', NULL),
  ('AUTOEXPRESS', 'REPUBLICA DOMINICANA'),
  ('IMPENETRA', 'MOZAMBIQUE'),
  ('LUMENIA BALLISTICS', 'CHILE'),
  ('RICARDO YOUNES', NULL),
  ('BLINGARD', NULL),
  ('BLINDAUTOS', NULL),
  ('BLIDOMCA', NULL),
  ('BLINDEX EXTREM', NULL),
  ('UNIVERSAL SECURITY', NULL),
  ('INPEK', NULL),
  ('BLINDEK', NULL)
ON CONFLICT (nombre) DO NOTHING;

-- Vehicle models (168)
INSERT INTO public.po_modelos_vehiculo (nombre, orden) VALUES
  ('AUDI A4 4D SEDAN 2004 - 2009', 1),
  ('AUDI Q3 SPORTBACK 2021', 2),
  ('AUDI Q3 WAGON 2019 - 2021', 3),
  ('AUDI Q5 SPORTBACK 2021', 4),
  ('AUDI Q7 4D UTILITY 2017 - 2021', 5),
  ('BMW X3 4D UTILITY 2018 - 2021', 6),
  ('BMW X4 4D HATCHBACK 2019 - 2021', 7),
  ('BMW X5 4D UTILITY 2019 - 2021', 8),
  ('BMW X6 4D UTILITY 2015 - 2019', 9),
  ('BMW X6 4D UTILITY 2020 - 2024', 10),
  ('CHEVROLET COLORADO 4D CREW CAB 2015 - 2023', 11),
  ('CHEVROLET TAHOE 4D UTILITY 2021', 12),
  ('CHEVROLET TAHOE 4D UTILITY 2015 - 2020', 13),
  ('DODGE RAM PICKUP 1500 4D CREW CAB 2019 - 2021', 14),
  ('FORD F150 4D CREW CAB 2009 - 2014', 15),
  ('FORD F150 4D CREW CAB 2015 - 2020', 16),
  ('FORD EXPEDITION 4D UTILITY 2018 - 2023', 17),
  ('FORD EXPLORER 4D UTILITY 2020 - 2023', 18),
  ('FORD EXPLORER 4D UTILITY 2011 - 2019', 19),
  ('HYUNDAI SANTA FE 4D UTILITY 2019 - 2021', 20),
  ('MAZDA CX5 4D UTILITY 2017 - 2023', 21),
  ('MERCEDES BENZ CLASE E 53 AMG 4D SEDAN 2019 - 2021', 22),
  ('MERCEDES BENZ CLASE E 280 2007', 23),
  ('MINI COOPER COUNTRYMAN 4D HATCHBACK 2017 - 2021', 24),
  ('NISSAN KICKS 4D UTILITY 2017 - 2020', 25),
  ('PORSCHE CAYENNE 4D UTILITY 2019 - 2021', 26),
  ('LAND ROVER RANGE ROVER VELAR 4D UTILITY 2018 - 2020', 27),
  ('RENAULT ALASKAN 2017', 28),
  ('TOYOTA 4 RUNNER 4D UTILITY 2010 - 2022', 29),
  ('TOYOTA COROLLA 4D SEDAN 2020 - 2021', 30),
  ('TOYOTA FORTUNER 4D UTILITY 2004 - 2015', 31),
  ('TOYOTA FORTUNER 4D UTILITY 2015 - 2021', 32),
  ('TOYOTA HILUX PICKUP 4D 2016 - 2021', 33),
  ('TOYOTA LAND CRUISER UZJ100 1998 - 2007', 34),
  ('TOYOTA LAND CRUISER VDJ200 4D UTILITY 2008- 2021', 35),
  ('TOYOTA LAND CRUISER 300 4D UTILITY 2022', 36),
  ('TOYOTA PRADO 4D UTILITY 2009 - 2021', 37),
  ('TOYOTA RAV4 4D UTILITY 2013-2017', 38),
  ('TOYOTA RAV4 4D UTILITY 2019 - 2021', 39),
  ('TOYOTA TACOMA PICKUP 4D CREW CAB 2017 - 2021', 40),
  ('TOYOTA TUNDRA PICKUP 4D CREW CAB 2017 - 2021', 41),
  ('TOYOTA HIGHLANDER 4D UTILITY 2008 - 2013', 42),
  ('VOLKSWAGEN TERAMONT 4D UTILITY 2019 - 2021', 43),
  ('VOLVO XC60 4D UTILITY 2018 - 2020', 44),
  ('LAND ROVER DISCOVERY SPORT 4D UTILITY 2019 - 2022', 45),
  ('VIDRIO PLANO', 46),
  ('VOLKSWAGEN AMAROK PICK UP 4D', 47),
  ('MAHINDRA PICK UP 4D', 48),
  ('VOLKSWAGEN TOUAREG 4D UTILITY', 49),
  ('JEEP GRAND CHEROKEE 4D UTILITY 2011 - 2020', 50),
  ('CHEVROLET TRAILBLAZER 4D UTILITY 2022', 51),
  ('MITSUBISHI MONTERO SPORT 4D UTILITY 2022', 52),
  ('SKODA KODIAQ 4D UTILITY 2023', 53),
  ('FORD EXPEDITION 4D UTILITY 2007 - 2017', 54),
  ('JEEP WRANGLER UNLIMITED RUBICON 4XE 4D UTILITY 2022 - 2023', 55),
  ('MINI COOPER S 4D UTILITY - 2012 - 2018', 56),
  ('NISSAN PATROL 4D UTILITY 1997 - 2009', 57),
  ('LEXUS GX460 4D UTILITY 2020 - 2023', 58),
  ('MERCEDES BENZ CLASE G 4D UTILITY 1991 - 2018', 59),
  ('FORD RANGER PICK UP 4D 2019 - 2022', 60),
  ('CHEVROLET DMAX PICKUP 4D 2022', 61),
  ('LEXUS LX 570 4D UTILITY 2007 - 2021', 62),
  ('MERCEDES BENZ CLASE G 4D UTILITY 2019 - 2023', 63),
  ('KIA CARNIVAL 4D VAN 2014 - 2020', 64),
  ('AUDI Q5 4D UTILITY 2017 - 2023', 65),
  ('KIA SORENTO 4D UTILITY 2021 - 2023', 66),
  ('KIA CARNIVAL 4D VAN 2021 - 2023', 67),
  ('FORD EXPEDITION MAX 4D UTILITY 2018 - 2023', 68),
  ('TOYOTA HILUX PICKUP 4D 2004 - 2015', 69),
  ('TOYOTA SEQUOIA 4D UTILITY 2008 - 2022', 70),
  ('NISSAN FRONTIER PICKUP 4D 2014 - 2022', 71),
  ('MITSUBISHI L200 PICKUP 4D 2019', 72),
  ('AUDI Q3 SPORTBACK 2020 - 2023', 73),
  ('MERCEDES BENZ CLASE GLC 4D COUPE 2020 - 2023', 74),
  ('CHEVROLET SUBURBAN 4D UTILITY 2015 - 2020', 75),
  ('PEUGEOT 2008 4D UTILITY 2019 - 2023', 76),
  ('MG RX8 4D UTILITY 2021 - 2023', 77),
  ('CHEVROLET SILVERADO PICKUP 4D 2020 - 2023', 78),
  ('FORD EDGE 4D UTILITY 2020 - 2023', 79),
  ('HONDA PILOT 4D UTILITY 2016 - 2022', 80),
  ('TOYOTA LAND CRUISER FZJ79 PICKUP 4D 2023', 81),
  ('MAZDA CX30 4D UTILITY 2020 - 2023', 82),
  ('TOYOTA COROLLA CROSS 4D UTILITY 2022 - 2024', 83),
  ('RENAULT KOLEOS 4D UTILITY 2016 - 2023', 84),
  ('HAVAL H6 4D UTILITY 2020 - 2023', 85),
  ('HAVAL H9 4D UTILITY 2020 - 2023', 86),
  ('CHEVROLET TRAVERSE 4D UTILITY 2017 - 2022', 87),
  ('SUZUKI JIMNY 3D UTILITY 2018 - 2023', 88),
  ('SAIC MAXUS T60 PICKUP 4D 2017 - 2023', 89),
  ('CADILLAC ESCALADE ESV 2021 - 2023', 90),
  ('VOLKSWAGEN TIGUAN 4D UTILITY 2020 - 2023', 91),
  ('NISSAN MURANO 4D UTILITY 2009 - 2014', 92),
  ('NISSAN X-TRAIL 4D UTILITY 2021 - 2024', 93),
  ('MAZDA BT50 PICKUP 4D 2011 - 2020', 94),
  ('KIA SORENTO 4D UTILITY 2009 - 2014', 95),
  ('NISSAN X-TRAIL 4D UTILITY 2016 - 2021', 96),
  ('FORD F450 2D SUPER DUTY PLANOS 2023 - 2024', 97),
  ('TOYOTA HILUX PICKUP 4D PLANO 2016 - 2024', 98),
  ('LEXUS RX 4D UTILITY 2023 - 2024', 99),
  ('MAZDA CX-90 4D UTILITY 2023 -2024', 100),
  ('PORSCHE CAYENNE 4D UTILITY 2011 - 2018', 101),
  ('MERCEDES BENZ CLASE C 4D SEDAN 2021 - 2024', 102),
  ('DODGE DURANGO 4D UTILITY 2010 - 2024', 103),
  ('MERCEDES BENZ CAMION PLANOS #1 2024', 104),
  ('MERCEDES BENZ CAMION PLANOS #2 2024', 105),
  ('FUSO FA CAMION PLANOS 2024', 106),
  ('AUDI Q8 e-tron SPORTBACK 2020 - 2024', 107),
  ('GMC ACADIA 4D UTILITY 2017 - 2023', 108),
  ('PORSCHE MACAN 4D UTILITY 2014 - 2023', 109),
  ('TOYOTA PRADO 4D UTILITY 1996 - 2009', 110),
  ('BMW X5 4D UTILITY 2013 - 2018', 111),
  ('FORD RANGER PICK UP 4D 2023 - 2024', 112),
  ('SUZUKI GRAND VITARA 4D UTILITY 2012 - 2019', 113),
  ('TOYOTA PRADO 250 4D UTILITY 2023 - 2026', 114),
  ('MERCEDES BENZ CLASE S 400 HYBRID LONG WHEELBASE 2010 - 2013', 115),
  ('MERCEDES BENZ SPRINTER 2014 - 2019', 116),
  ('SUBARU FORESTER 4D UTILITY 2019 - 2024', 117),
  ('HINO GH8J CAMION 2019', 118),
  ('BMW X6 4D UTILITY 2008 - 2014', 119),
  ('GREAT WALL POER PICK-UP 4D 2019 - 2024', 120),
  ('GEELY AZKARRA 4D UTILITY 2019 - 2024', 121),
  ('JMC VIGUS WORK PICK-UP 4D 2024', 122),
  ('MAZDA CX9 4D UTILITY 2016 - 2023', 123),
  ('TOYOTA FJ CRUISER 4D UTILITY 2007 - 2014', 124),
  ('MERCEDES BENZ CLASE GLE AMG 4D COUPE 2020 - 2024', 125),
  ('SSANGYONG REXTON 4D UTILITY 2022 - 2024', 126),
  ('FORD RANGER PICK UP 2D VIDRIOS PLANOS 2025', 127),
  ('TOYOTA LAND CRUISER J80 1990 - 1997', 128),
  ('MITSUBISHI OUTLANDER 4D UTILITY 2022 - 2025', 129),
  ('MERCEDES BENZ ATEGO VIDRIO PLANO 2025', 130),
  ('FORD EVEREST 4D UTILITY 2022 - 2025', 131),
  ('MITSUBISHI TRITON PICK-UP 4D 2024 - 2025', 132),
  ('VEHICULO TACTICO POLICIA COSTA RICA', 133),
  ('JEEP WRANGLER YJ 2D UTILITY 1986 - 1996', 134),
  ('MG ONE 4D UTILITY 2022 - 2025', 135),
  ('MERCEDES BENZ CLASE GLE W 4D UTILITY 2020 - 2025', 136),
  ('GWM TANK 500 4D UTILITY 2025', 137),
  ('CHEVROLET SUBURBAN 4D UTILITY 2021 - 2025', 138),
  ('AUDI A6 4D SEDAN 2019 - 2025', 139),
  ('JAC T6 PICK-UP 4D 2019 - 2025', 140),
  ('JAC T8 PICK-UP 4D 2019 - 2025', 141),
  ('BAIC BJ60 4D UTILITY 2022 - 2026', 142),
  ('MERCEDES BENZ CLASE ML 4D UTILITY 2011 - 2019', 143),
  ('CHEVROLET CAPTIVA 4D UTILITY 2019 - 2025', 144),
  ('BMW X7 4D UTILITY 2019 - 2025', 145),
  ('BMW X3 4D UTILITY 2024 - 2026', 146),
  ('HONDA PILOT 4D UTILITY 2023 - 2025', 147),
  ('CHEVROLET DMAX PICKUP 2D 2022', 148),
  ('AUDI Q6 e-tron SPORTBACK 2025 - 2026', 149),
  ('GMC YUKON DENALI 4D UTILITY 2021 - 2026', 150),
  ('KIA EV5 4D UTILITY 2023 - 2026', 151),
  ('CAMION HINO #955', 152),
  ('CAMION HINO #959', 153),
  ('LINCOLN NAVIGATOR 4D UTILITY 2018 - 2024', 154),
  ('MERCEDES BENZ CLASE GLC 4D WAGON 2023 - 2026', 155),
  ('TOYOTA 4 RUNNER 4D UTILITY 2025 - 2026', 156),
  ('DONGFENG HUGE 4D UTILITY 2024 - 2026', 157),
  ('ISUZU D-MAX PICKUP 4D 2023 - 2026', 158),
  ('ISUZU D-MAX TÁCTICO PICKUP 4D 2023 - 2026', 159),
  ('BYD SHARK PICK-UP 4D 2024 - 2027', 160),
  ('FORD EXPEDITION 4D UTILITY 2025 - 2027', 161),
  ('SUBARU TRIBECA 4D UTILITY 2008 - 2014', 162),
  ('TOYOTA RAV4 4D UTILITY 2022 - 2025', 163),
  ('MERCEDES BENZ MAYBACH CLASE S HYBRID 4D SEDAN 2023 - 2026', 164),
  ('BYD ATTO 8 4D UTILITY 2025 - 2026', 165),
  ('JETOUR G700 4D UTILITY 2026 - 2027', 166),
  ('ISUZU MUX 4D UTILITY 2024 - 2026', 167),
  ('MG RX9 4D UTILITY 2024 - 2026', 168)
ON CONFLICT (nombre) DO NOTHING;

-- Glass pieces
INSERT INTO public.po_piezas_vidrio (codigo, nombre, abreviatura, orden) VALUES
  ('00', 'PARABRISAS CON ANTENA', 'PBS', 1),
  ('00', 'PARABRISAS CON ANTENA + RED', 'PBS', 2),
  ('00', 'PARABRISAS CON BASE DE ESPEJO + SENSOR', 'PBS', 3),
  ('00', 'PARABRISAS CON SENSOR + CAMARA', 'PBS', 4),
  ('01', 'VENTILETE DELANTERO IZQUIERDO', 'VDI', 5),
  ('02', 'VENTILETE DELANTERO DERECHO', 'VDD', 6),
  ('03', 'LATERAL DELANTERO IZQUIERDO', 'LDI', 7),
  ('04', 'LATERAL DELANTERO DERECHO', 'LDD', 8),
  ('05', 'LATERAL TRASERO IZQUIERDO', 'LTI', 9),
  ('06', 'LATERAL TRASERO DERECHO', 'LTD', 10),
  ('07', 'VENTILETE TRASERO IZQUIERDO', 'VTI', 11),
  ('08', 'VENTILETE TRASERO DERECHO', 'VTD', 12),
  ('09', 'LATERAL CABINA IZQUIERDO CON ANTENA', 'LCI', 13),
  ('09', 'LATERAL CABINA IZQUIERDO', 'LCI', 14),
  ('10', 'LATERAL CABINA DERECHO CON ANTENA', 'LCD', 15),
  ('10', 'LATERAL CABINA DERECHO', 'LCD', 16),
  ('11', 'POSTERIOR', 'POS', 17),
  ('12', 'SUN ROOF', 'SRF', 18),
  ('13', 'LATERAL TRASERO EXTENDIDO IZQUIERDO', 'LTEI', 19),
  ('14', 'LATERAL TRASERO EXTENDIDO DERECHO', 'LTED', 20),
  ('15', 'COMPUERTA IZQUIERDA', 'COM-IZQ', 21),
  ('16', 'COMPUERTA DERECHA', 'COM-DER', 22),
  ('17', 'SUN ROOF DELANTERO INTERNO', 'SRFD', 23),
  ('17', 'SUN ROOF DELANTERO', 'SRFD', 24),
  ('18', 'SUN ROOF TRASERO INTERNO', 'SRFT', 25),
  ('18', 'SUN ROOF TRASERO', 'SRFT', 26),
  ('19', 'SUN ROOF TRASERO IZQUIERDO', 'SRFTI', 27),
  ('20', 'SUN ROOF TRASERO DERECHO', 'SRFTD', 28),
  ('21', 'POSTERIOR ANTEPUESTO', 'POS-ANT', 29),
  ('22', 'LATERAL CABINA IZQUIERDA ANTEPUESTA', 'LCI-ANT', 30),
  ('23', 'LATERAL CABINA DERECHA ANTEPUESTA', 'LCD-ANT', 31),
  ('24', 'VIDRIO PLANO PARTICIÓN', 'POS-VP', 32),
  ('25', 'LATERAL CABINA IZQUIERDA VIDRIO PLANO', 'LCI-VP', 33),
  ('26', 'LATERAL CABINA DERECHA VIDRIO PLANO', 'LCD-VP', 34)
ON CONFLICT (nombre) DO NOTHING;
