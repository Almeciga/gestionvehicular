-- ═══════════════════════════════════════════════════════════════
-- Migration: Vehicle brands, documents, seats/axles, trabajos, tools
-- Timestamp: 20261011180000
-- Idempotent: YES (uses IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- ═══════════════════════════════════════════════════════════════

-- ─── 1. Add seats/axles columns to vehicles ──────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS cantidad_puestos integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cantidad_ejes    integer DEFAULT 2;

-- ─── 2. Vehicle brands catalog ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_brands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  categoria   text NOT NULL DEFAULT 'auto',  -- auto, suv, pickup, bus, camion, moto
  pais_origen text,
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.vehicle_brands ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_brands' AND policyname='vehicle_brands_read_all'
  ) THEN
    CREATE POLICY vehicle_brands_read_all ON public.vehicle_brands
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_brands' AND policyname='vehicle_brands_admin_write'
  ) THEN
    CREATE POLICY vehicle_brands_admin_write ON public.vehicle_brands
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ─── 3. Vehicle documents ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehicle_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  tipo            text NOT NULL,  -- soat, tecno, seguro_todo_riesgo, tarjeta_propiedad, licencia_conduccion, tarjeta_transito
  estado          text NOT NULL DEFAULT 'pendiente',  -- pendiente, cargado, vencido, por_vencer
  fecha_vencimiento date,
  archivo_url     text,
  archivo_mime    text,
  notas           text,
  uploaded_by     uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamptz DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT vehicle_documents_tipo_check CHECK (
    tipo IN ('soat','tecno','seguro_todo_riesgo','tarjeta_propiedad','licencia_conduccion','tarjeta_transito')
  ),
  CONSTRAINT vehicle_documents_estado_check CHECK (
    estado IN ('pendiente','cargado','vencido','por_vencer')
  )
);

CREATE INDEX IF NOT EXISTS idx_vehicle_documents_vehicle_id ON public.vehicle_documents(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_documents_tipo ON public.vehicle_documents(tipo);

ALTER TABLE public.vehicle_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_documents' AND policyname='vehicle_documents_read'
  ) THEN
    CREATE POLICY vehicle_documents_read ON public.vehicle_documents
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_documents' AND policyname='vehicle_documents_write'
  ) THEN
    CREATE POLICY vehicle_documents_write ON public.vehicle_documents
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─── 4. Trabajos (work orders) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.trabajos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  descripcion     text NOT NULL,
  parte_vehiculo  text,
  fecha_inicio    date NOT NULL,
  fecha_fin       date,
  estado          text NOT NULL DEFAULT 'pendiente',  -- pendiente, en_ejecucion, finalizado
  responsable     text,
  observaciones   text,
  materiales      jsonb DEFAULT '[]'::jsonb,  -- [{material_id, nombre, cantidad, unidad}]
  herramientas    jsonb DEFAULT '[]'::jsonb,  -- [{herramienta_id, nombre}]
  created_by      uuid REFERENCES public.profiles(id),
  created_at      timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at      timestamptz DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT trabajos_estado_check CHECK (
    estado IN ('pendiente','en_ejecucion','finalizado')
  ),
  CONSTRAINT trabajos_fechas_check CHECK (
    fecha_fin IS NULL OR fecha_fin >= fecha_inicio
  )
);

CREATE INDEX IF NOT EXISTS idx_trabajos_vehicle_id ON public.trabajos(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_estado ON public.trabajos(estado);
CREATE INDEX IF NOT EXISTS idx_trabajos_updated_at ON public.trabajos(updated_at);

ALTER TABLE public.trabajos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='trabajos' AND policyname='trabajos_read'
  ) THEN
    CREATE POLICY trabajos_read ON public.trabajos
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='trabajos' AND policyname='trabajos_write'
  ) THEN
    CREATE POLICY trabajos_write ON public.trabajos
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─── 5. Herramientas (tools inventory) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.herramientas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  categoria   text NOT NULL,  -- manual, electrica, neumatica, diagnostico, elevacion, medicion
  estado      text NOT NULL DEFAULT 'disponible',  -- disponible, en_uso, mantenimiento, baja
  descripcion text,
  codigo      text,
  activo      boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
  updated_at  timestamptz DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT herramientas_estado_check CHECK (
    estado IN ('disponible','en_uso','mantenimiento','baja')
  ),
  CONSTRAINT herramientas_categoria_check CHECK (
    categoria IN ('manual','electrica','neumatica','diagnostico','elevacion','medicion','otro')
  )
);

CREATE INDEX IF NOT EXISTS idx_herramientas_categoria ON public.herramientas(categoria);
CREATE INDEX IF NOT EXISTS idx_herramientas_estado ON public.herramientas(estado);

ALTER TABLE public.herramientas ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='herramientas' AND policyname='herramientas_read'
  ) THEN
    CREATE POLICY herramientas_read ON public.herramientas
      FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='herramientas' AND policyname='herramientas_admin_write'
  ) THEN
    CREATE POLICY herramientas_admin_write ON public.herramientas
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- ─── 6. Seed: Colombian vehicle brands (idempotent) ──────────────────────────
-- Source: RUNT Colombia, ANDI, Fenalco Automotor 2024 registrations
INSERT INTO public.vehicle_brands (nombre, categoria, pais_origen) VALUES
  -- Autos / Sedanes
  ('Chevrolet','auto','Estados Unidos'),
  ('Renault','auto','Francia'),
  ('Kia','auto','Corea del Sur'),
  ('Hyundai','auto','Corea del Sur'),
  ('Mazda','auto','Japón'),
  ('Toyota','auto','Japón'),
  ('Volkswagen','auto','Alemania'),
  ('Ford','auto','Estados Unidos'),
  ('Nissan','auto','Japón'),
  ('Honda','auto','Japón'),
  ('Mitsubishi','auto','Japón'),
  ('Suzuki','auto','Japón'),
  ('Fiat','auto','Italia'),
  ('Peugeot','auto','Francia'),
  ('Citroën','auto','Francia'),
  ('Seat','auto','España'),
  ('Skoda','auto','República Checa'),
  ('BMW','auto','Alemania'),
  ('Mercedes-Benz','auto','Alemania'),
  ('Audi','auto','Alemania'),
  ('Volvo','auto','Suecia'),
  ('Subaru','auto','Japón'),
  ('Dodge','auto','Estados Unidos'),
  ('Jeep','auto','Estados Unidos'),
  ('Chrysler','auto','Estados Unidos'),
  ('Alfa Romeo','auto','Italia'),
  ('Lada','auto','Rusia'),
  ('Chery','auto','China'),
  ('JAC','auto','China'),
  ('Geely','auto','China'),
  ('BYD','auto','China'),
  ('MG','auto','China'),
  ('Haval','auto','China'),
  ('Zotye','auto','China'),
  ('Brilliance','auto','China'),
  ('Lifan','auto','China'),
  ('BAIC','auto','China'),
  ('Foton','auto','China'),
  ('Great Wall','auto','China'),
  ('Dongfeng','auto','China'),
  -- SUV / Camionetas
  ('Land Rover','suv','Reino Unido'),
  ('Porsche','suv','Alemania'),
  ('Lexus','suv','Japón'),
  ('Infiniti','suv','Japón'),
  ('Acura','suv','Japón'),
  ('Lincoln','suv','Estados Unidos'),
  ('Cadillac','suv','Estados Unidos'),
  ('GMC','suv','Estados Unidos'),
  ('Buick','suv','Estados Unidos'),
  -- Pick-ups
  ('Ram','pickup','Estados Unidos'),
  ('Isuzu','pickup','Japón'),
  ('Tata','pickup','India'),
  ('Mahindra','pickup','India'),
  ('Ssangyong','pickup','Corea del Sur'),
  -- Buses / Microbuses
  ('Mercedes-Benz Bus','bus','Alemania'),
  ('Volvo Bus','bus','Suecia'),
  ('Scania','bus','Suecia'),
  ('Hino','bus','Japón'),
  ('King Long','bus','China'),
  ('Yutong','bus','China'),
  ('Zhongtong','bus','China'),
  ('Marcopolo','bus','Brasil'),
  ('Busscar','bus','Brasil'),
  ('Comil','bus','Brasil'),
  ('Superpolo','bus','Colombia'),
  ('Dina','bus','México'),
  ('Agrale','bus','Brasil'),
  -- Camiones
  ('Kenworth','camion','Estados Unidos'),
  ('Freightliner','camion','Estados Unidos'),
  ('International','camion','Estados Unidos'),
  ('Mack','camion','Estados Unidos'),
  ('Peterbilt','camion','Estados Unidos'),
  ('Western Star','camion','Estados Unidos'),
  ('Volvo Trucks','camion','Suecia'),
  ('Scania Trucks','camion','Suecia'),
  ('MAN','camion','Alemania'),
  ('DAF','camion','Países Bajos'),
  ('Iveco','camion','Italia'),
  ('Renault Trucks','camion','Francia'),
  ('Sinotruk','camion','China'),
  ('Shacman','camion','China'),
  ('FAW','camion','China'),
  ('Camc','camion','China'),
  ('Jac Trucks','camion','China'),
  -- Motocicletas
  ('Yamaha','moto','Japón'),
  ('Honda Moto','moto','Japón'),
  ('Suzuki Moto','moto','Japón'),
  ('Kawasaki','moto','Japón'),
  ('KTM','moto','Austria'),
  ('BMW Motorrad','moto','Alemania'),
  ('Ducati','moto','Italia'),
  ('Harley-Davidson','moto','Estados Unidos'),
  ('Royal Enfield','moto','India'),
  ('Bajaj','moto','India'),
  ('Hero','moto','India'),
  ('TVS','moto','India'),
  ('Auteco','moto','Colombia'),
  ('AKT','moto','Colombia'),
  ('Bera','moto','China'),
  ('Loncin','moto','China'),
  ('Jialing','moto','China'),
  ('Shineray','moto','China'),
  ('Skygo','moto','China'),
  ('Benelli','moto','Italia'),
  ('CF Moto','moto','China'),
  ('Zongshen','moto','China'),
  ('Otro','auto',NULL)
ON CONFLICT DO NOTHING;

-- ─── 7. Seed: Materials catalog (idempotent) ─────────────────────────────────
INSERT INTO public.materials (id, nombre, categoria, unidad, stock, stock_minimo, descripcion) VALUES
  -- Repuestos
  (gen_random_uuid(),'Filtro de aceite','repuestos','unidad',20,5,'Filtro de aceite motor universal'),
  (gen_random_uuid(),'Filtro de aire','repuestos','unidad',15,5,'Filtro de aire motor'),
  (gen_random_uuid(),'Filtro de combustible','repuestos','unidad',10,3,'Filtro de combustible gasolina/diesel'),
  (gen_random_uuid(),'Filtro de habitáculo','repuestos','unidad',10,3,'Filtro de cabina / polen'),
  (gen_random_uuid(),'Pastillas de freno delanteras','frenos','par',12,4,'Pastillas freno disco delantero'),
  (gen_random_uuid(),'Pastillas de freno traseras','frenos','par',10,4,'Pastillas freno disco trasero'),
  (gen_random_uuid(),'Zapatas de freno','frenos','par',8,2,'Zapatas freno tambor'),
  (gen_random_uuid(),'Disco de freno delantero','frenos','unidad',8,2,'Disco freno ventilado delantero'),
  (gen_random_uuid(),'Disco de freno trasero','frenos','unidad',6,2,'Disco freno trasero'),
  (gen_random_uuid(),'Líquido de frenos DOT4','frenos','litro',10,3,'Líquido hidráulico frenos DOT4'),
  -- Lubricantes
  (gen_random_uuid(),'Aceite motor 5W-30 sintético','lubricantes','litro',50,10,'Aceite motor sintético 5W-30'),
  (gen_random_uuid(),'Aceite motor 10W-40 semisintético','lubricantes','litro',40,10,'Aceite motor semisintético 10W-40'),
  (gen_random_uuid(),'Aceite motor 15W-40 mineral','lubricantes','litro',30,10,'Aceite motor mineral 15W-40'),
  (gen_random_uuid(),'Aceite de caja manual','lubricantes','litro',15,5,'Aceite transmisión manual 75W-90'),
  (gen_random_uuid(),'Aceite de caja automática ATF','lubricantes','litro',15,5,'Aceite transmisión automática ATF'),
  (gen_random_uuid(),'Aceite de dirección hidráulica','lubricantes','litro',10,3,'Aceite dirección hidráulica'),
  (gen_random_uuid(),'Grasa multipropósito','lubricantes','kg',5,2,'Grasa de litio multipropósito'),
  (gen_random_uuid(),'Aceite diferencial 80W-90','lubricantes','litro',10,3,'Aceite diferencial hipoides'),
  -- Fluidos
  (gen_random_uuid(),'Refrigerante anticongelante verde','fluidos','litro',20,5,'Refrigerante motor verde 50/50'),
  (gen_random_uuid(),'Refrigerante anticongelante rojo','fluidos','litro',15,5,'Refrigerante motor rojo OAT'),
  (gen_random_uuid(),'Agua destilada','fluidos','litro',20,5,'Agua destilada para baterías y radiador'),
  (gen_random_uuid(),'Líquido limpiaparabrisas','fluidos','litro',10,3,'Líquido limpiador parabrisas'),
  (gen_random_uuid(),'Líquido de embrague','fluidos','litro',5,2,'Líquido hidráulico embrague DOT3'),
  -- Suspensión
  (gen_random_uuid(),'Amortiguador delantero','suspension','unidad',8,2,'Amortiguador telescópico delantero'),
  (gen_random_uuid(),'Amortiguador trasero','suspension','unidad',8,2,'Amortiguador telescópico trasero'),
  (gen_random_uuid(),'Resorte helicoidal delantero','suspension','unidad',6,2,'Resorte suspensión delantera'),
  (gen_random_uuid(),'Resorte helicoidal trasero','suspension','unidad',6,2,'Resorte suspensión trasera'),
  (gen_random_uuid(),'Buje de barra estabilizadora','suspension','unidad',20,5,'Buje caucho barra estabilizadora'),
  (gen_random_uuid(),'Rotula de dirección','suspension','unidad',10,3,'Rótula dirección delantera'),
  (gen_random_uuid(),'Terminal de dirección','suspension','unidad',10,3,'Terminal barra dirección'),
  (gen_random_uuid(),'Muñón de rueda','suspension','unidad',4,1,'Muñón / cubo de rueda'),
  -- Eléctrico
  (gen_random_uuid(),'Batería 12V 45Ah','electrico','unidad',5,2,'Batería plomo-ácido 12V 45Ah'),
  (gen_random_uuid(),'Batería 12V 60Ah','electrico','unidad',5,2,'Batería plomo-ácido 12V 60Ah'),
  (gen_random_uuid(),'Batería 12V 80Ah','electrico','unidad',3,1,'Batería plomo-ácido 12V 80Ah'),
  (gen_random_uuid(),'Bujía de encendido','electrico','unidad',50,10,'Bujía encendido estándar'),
  (gen_random_uuid(),'Bujía de precalentamiento','electrico','unidad',20,5,'Bujía calentamiento diesel'),
  (gen_random_uuid(),'Alternador','electrico','unidad',3,1,'Alternador 12V 90A'),
  (gen_random_uuid(),'Motor de arranque','electrico','unidad',3,1,'Motor de arranque 12V'),
  (gen_random_uuid(),'Fusible automotriz 10A','electrico','unidad',100,20,'Fusible plano 10A'),
  (gen_random_uuid(),'Fusible automotriz 15A','electrico','unidad',100,20,'Fusible plano 15A'),
  (gen_random_uuid(),'Fusible automotriz 20A','electrico','unidad',100,20,'Fusible plano 20A'),
  (gen_random_uuid(),'Relé universal 12V','electrico','unidad',20,5,'Relé electromagnético 12V 30A'),
  (gen_random_uuid(),'Cable de batería positivo','electrico','metro',10,3,'Cable 16mm² rojo batería'),
  (gen_random_uuid(),'Cable de batería negativo','electrico','metro',10,3,'Cable 16mm² negro batería'),
  -- Pintura y latonería
  (gen_random_uuid(),'Pintura base imprimante','pintura','litro',10,3,'Imprimante gris para carrocería'),
  (gen_random_uuid(),'Pintura poliuretano blanco','pintura','litro',5,2,'Pintura poliuretano blanco brillante'),
  (gen_random_uuid(),'Pintura poliuretano negro','pintura','litro',5,2,'Pintura poliuretano negro mate'),
  (gen_random_uuid(),'Lija grano 80','pintura','unidad',50,10,'Lija abrasiva grano 80'),
  (gen_random_uuid(),'Lija grano 180','pintura','unidad',50,10,'Lija abrasiva grano 180'),
  (gen_random_uuid(),'Lija grano 400','pintura','unidad',50,10,'Lija abrasiva grano 400'),
  (gen_random_uuid(),'Masilla plástica','pintura','kg',5,2,'Masilla poliéster para carrocería'),
  (gen_random_uuid(),'Thinner acrílico','pintura','litro',10,3,'Diluyente acrílico para pintura'),
  (gen_random_uuid(),'Barniz transparente','pintura','litro',5,2,'Barniz 2K transparente'),
  -- Neumáticos
  (gen_random_uuid(),'Neumático 185/65 R15','neumaticos','unidad',8,2,'Llanta radial 185/65 R15'),
  (gen_random_uuid(),'Neumático 195/65 R15','neumaticos','unidad',8,2,'Llanta radial 195/65 R15'),
  (gen_random_uuid(),'Neumático 205/55 R16','neumaticos','unidad',6,2,'Llanta radial 205/55 R16'),
  (gen_random_uuid(),'Neumático 225/65 R17','neumaticos','unidad',6,2,'Llanta radial 225/65 R17 SUV'),
  (gen_random_uuid(),'Neumático 265/70 R17','neumaticos','unidad',4,2,'Llanta radial 265/70 R17 4x4'),
  (gen_random_uuid(),'Válvula de neumático TR413','neumaticos','unidad',50,10,'Válvula goma TR413'),
  -- Tornillería y consumibles
  (gen_random_uuid(),'Tornillo M8x25 hexagonal','tornilleria','unidad',200,50,'Tornillo métrico M8x25 acero'),
  (gen_random_uuid(),'Tornillo M10x30 hexagonal','tornilleria','unidad',200,50,'Tornillo métrico M10x30 acero'),
  (gen_random_uuid(),'Tuerca M8 autoblocante','tornilleria','unidad',200,50,'Tuerca nyloc M8'),
  (gen_random_uuid(),'Tuerca M10 autoblocante','tornilleria','unidad',200,50,'Tuerca nyloc M10'),
  (gen_random_uuid(),'Arandela plana M8','tornilleria','unidad',300,50,'Arandela plana M8 acero'),
  (gen_random_uuid(),'Arandela de presión M8','tornilleria','unidad',300,50,'Arandela Grower M8'),
  (gen_random_uuid(),'Perno de rueda M12x1.5','tornilleria','unidad',50,10,'Perno rueda M12x1.5x35'),
  (gen_random_uuid(),'Silicona RTV gris','consumibles','unidad',10,3,'Silicona sellante RTV gris motor'),
  (gen_random_uuid(),'Silicona RTV negra','consumibles','unidad',10,3,'Silicona sellante RTV negra'),
  (gen_random_uuid(),'Cinta aislante','consumibles','rollo',20,5,'Cinta aislante PVC negra 19mm'),
  (gen_random_uuid(),'Limpiador de frenos','consumibles','aerosol',15,5,'Desengrasante frenos en aerosol'),
  (gen_random_uuid(),'Desengrasante multiusos','consumibles','litro',10,3,'Desengrasante industrial'),
  (gen_random_uuid(),'Trapo industrial','consumibles','kg',10,3,'Trapo industrial absorbente'),
  (gen_random_uuid(),'Guantes de nitrilo','consumibles','par',50,10,'Guantes nitrilo talla M'),
  (gen_random_uuid(),'Papel de taller','consumibles','rollo',20,5,'Papel absorbente taller')
ON CONFLICT DO NOTHING;

-- ─── 8. Seed: Tools inventory (idempotent) ───────────────────────────────────
INSERT INTO public.herramientas (nombre, categoria, estado, descripcion, codigo) VALUES
  -- Manuales
  ('Juego de llaves combinadas 8-32mm','manual','disponible','Set 12 llaves combinadas cromo-vanadio','HM-001'),
  ('Juego de llaves Allen métrico','manual','disponible','Set llaves hexagonales 1.5-10mm','HM-002'),
  ('Juego de llaves Allen pulgadas','manual','disponible','Set llaves hexagonales 1/16-3/8"','HM-003'),
  ('Juego de destornilladores planos','manual','disponible','Set 6 destornilladores planos','HM-004'),
  ('Juego de destornilladores de estrella','manual','disponible','Set 6 destornilladores Phillips','HM-005'),
  ('Llave de torque 1/2" 20-200Nm','manual','disponible','Torquímetro click 1/2" 20-200Nm','HM-006'),
  ('Llave de torque 3/8" 5-60Nm','manual','disponible','Torquímetro click 3/8" 5-60Nm','HM-007'),
  ('Juego de dados 1/2" métrico','manual','disponible','Set 26 dados 1/2" 8-32mm','HM-008'),
  ('Juego de dados 3/8" métrico','manual','disponible','Set 24 dados 3/8" 6-22mm','HM-009'),
  ('Extensión de dados 1/2" 250mm','manual','disponible','Extensión articulada 1/2"','HM-010'),
  ('Mazo de goma 1kg','manual','disponible','Mazo caucho negro 1kg','HM-011'),
  ('Martillo de bola 500g','manual','disponible','Martillo mecánico 500g','HM-012'),
  ('Alicates de presión','manual','disponible','Alicates Vise-Grip 10"','HM-013'),
  ('Alicates de punta','manual','disponible','Alicates punta fina 8"','HM-014'),
  ('Alicates de corte','manual','disponible','Alicates corte diagonal 7"','HM-015'),
  ('Pinzas de segger externas','manual','disponible','Pinzas anillos Seeger externos','HM-016'),
  ('Pinzas de segger internas','manual','disponible','Pinzas anillos Seeger internos','HM-017'),
  ('Extractor de rótulas','manual','disponible','Extractor rótulas y terminales','HM-018'),
  ('Extractor de poleas','manual','disponible','Extractor poleas 3 garras','HM-019'),
  ('Compresor de resortes','manual','disponible','Compresor muelles suspensión','HM-020'),
  -- Eléctricas
  ('Taladro percutor 13mm 750W','electrica','disponible','Taladro percutor 750W con maletín','HE-001'),
  ('Amoladora angular 4.5" 900W','electrica','disponible','Amoladora angular 115mm 900W','HE-002'),
  ('Amoladora angular 7" 2200W','electrica','disponible','Amoladora angular 180mm 2200W','HE-003'),
  ('Pulidora orbital 150mm','electrica','disponible','Pulidora excéntrica 150mm 350W','HE-004'),
  ('Soldadora MIG 200A','electrica','disponible','Soldadora MIG/MAG 200A monofásica','HE-005'),
  ('Soldadora TIG 200A','electrica','disponible','Soldadora TIG 200A AC/DC','HE-006'),
  ('Soldadora de punto','electrica','disponible','Soldadora de punto carrocería 6kVA','HE-007'),
  ('Cargador de batería 12/24V','electrica','disponible','Cargador baterías 12/24V 20A','HE-008'),
  ('Probador de batería digital','electrica','disponible','Analizador baterías 12V CCA','HE-009'),
  ('Lámpara de trabajo LED 50W','electrica','disponible','Lámpara portátil LED 50W','HE-010'),
  -- Neumáticas
  ('Pistola de impacto 1/2" 1000Nm','neumatica','disponible','Pistola impacto neumática 1/2" 1000Nm','HN-001'),
  ('Pistola de impacto 3/4" 2000Nm','neumatica','disponible','Pistola impacto neumática 3/4" 2000Nm','HN-002'),
  ('Pistola de pintura HVLP','neumatica','disponible','Pistola pintura HVLP 1.4mm','HN-003'),
  ('Lijadora orbital neumática','neumatica','disponible','Lijadora orbital neumática 150mm','HN-004'),
  ('Lijadora de banda neumática','neumatica','disponible','Lijadora banda neumática 75x533mm','HN-005'),
  ('Martillo neumático','neumatica','disponible','Martillo cincel neumático 1/2"','HN-006'),
  ('Inflador de neumáticos digital','neumatica','disponible','Inflador digital con manómetro','HN-007'),
  ('Compresor de aire 50L 2HP','neumatica','disponible','Compresor aire 50L 2HP 8bar','HN-008'),
  -- Diagnóstico
  ('Scanner OBD2 universal','diagnostico','disponible','Escáner diagnóstico OBD2 multimarca','HD-001'),
  ('Scanner OBD2 profesional','diagnostico','disponible','Escáner diagnóstico profesional con PC','HD-002'),
  ('Multímetro digital automotriz','diagnostico','disponible','Multímetro TRMS 1000V CAT III','HD-003'),
  ('Osciloscopio automotriz 4 canales','diagnostico','disponible','Osciloscopio 4CH 100MHz automotriz','HD-004'),
  ('Probador de inyectores','diagnostico','disponible','Probador limpieza inyectores 4 vías','HD-005'),
  ('Manómetro de compresión','diagnostico','disponible','Manómetro compresión motor 0-300psi','HD-006'),
  ('Manómetro de presión de combustible','diagnostico','disponible','Manómetro presión combustible 0-100psi','HD-007'),
  ('Cámara endoscópica','diagnostico','disponible','Endoscopio flexible 5.5mm 1m','HD-008'),
  ('Detector de fugas de refrigerante','diagnostico','disponible','Detector electrónico fugas refrigerante','HD-009'),
  ('Probador de circuitos 12V','diagnostico','disponible','Probador circuitos 12V con LED','HD-010'),
  -- Elevación
  ('Gato hidráulico de piso 3T','elevacion','disponible','Gato piso hidráulico 3 toneladas','HV-001'),
  ('Gato hidráulico de piso 5T','elevacion','disponible','Gato piso hidráulico 5 toneladas','HV-002'),
  ('Caballetes de seguridad 3T (par)','elevacion','disponible','Caballetes seguridad 3T par','HV-003'),
  ('Caballetes de seguridad 5T (par)','elevacion','disponible','Caballetes seguridad 5T par','HV-004'),
  ('Elevador de tijera 2T','elevacion','disponible','Elevador tijera hidráulico 2T','HV-005'),
  ('Rampa de acceso','elevacion','disponible','Rampa aluminio 2T par','HV-006'),
  -- Medición
  ('Calibrador Vernier 150mm','medicion','disponible','Calibrador digital 0-150mm 0.01mm','HMD-001'),
  ('Micrómetro exterior 0-25mm','medicion','disponible','Micrómetro exterior 0-25mm 0.001mm','HMD-002'),
  ('Micrómetro exterior 25-50mm','medicion','disponible','Micrómetro exterior 25-50mm 0.001mm','HMD-003'),
  ('Reloj comparador 0-10mm','medicion','disponible','Reloj comparador 0-10mm 0.01mm','HMD-004'),
  ('Regla de precisión 500mm','medicion','disponible','Regla acero inoxidable 500mm','HMD-005'),
  ('Nivel de burbuja 600mm','medicion','disponible','Nivel aluminio 600mm 3 burbujas','HMD-006'),
  ('Termómetro infrarrojo','medicion','disponible','Termómetro IR -50 a 550°C','HMD-007'),
  ('Medidor de espesores de pintura','medicion','disponible','Medidor espesor pintura 0-2000μm','HMD-008')
ON CONFLICT DO NOTHING;

-- ─── 9. Updated_at trigger for trabajos ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trabajos_updated_at'
  ) THEN
    CREATE TRIGGER trabajos_updated_at
      BEFORE UPDATE ON public.trabajos
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'herramientas_updated_at'
  ) THEN
    CREATE TRIGGER herramientas_updated_at
      BEFORE UPDATE ON public.herramientas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'vehicle_documents_updated_at'
  ) THEN
    CREATE TRIGGER vehicle_documents_updated_at
      BEFORE UPDATE ON public.vehicle_documents
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
