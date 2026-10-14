/**
 * Pure function: (seats, axles) → inspection diagram configuration.
 * Determines which vehicle diagram to show based on passenger count and axle count.
 * Fully testable with no side effects.
 */

export interface InspectionDiagramConfig {
  /** Vehicle type label for display */
  vehicleType: string;
  /** Number of tire positions to show */
  tireCount: number;
  /** Number of axles */
  axleCount: number;
  /** Number of seat positions */
  seatCount: number;
  /** Diagram variant key for rendering */
  diagramVariant: 'moto' | 'auto' | 'suv' | 'minivan' | 'bus' | 'camion_2e' | 'camion_3e' | 'camion_4e';
  /** Whether to show dual rear tires */
  dualRearTires: boolean;
  /** Seat rows configuration [front, middle, rear] */
  seatRows: number[];
}

/**
 * Derives the inspection diagram configuration from passenger seats and axle count.
 * Rules:
 * - 1-2 seats, 2 axles → moto
 * - 3-5 seats, 2 axles → auto
 * - 6-8 seats, 2 axles → suv/camioneta
 * - 9-15 seats, 2 axles → minivan/microbus
 * - 16-45 seats, 2 axles → bus
 * - 3+ axles → camion (with dual rear tires)
 */
export function getInspectionDiagramConfig(
  seats: number,
  axles: number
): InspectionDiagramConfig {
  const s = Math.max(1, seats);
  const a = Math.max(2, axles);

  // Motorcycles
  if (s <= 2 && a === 2) {
    return {
      vehicleType: 'Motocicleta',
      tireCount: 2,
      axleCount: 2,
      seatCount: s,
      diagramVariant: 'moto',
      dualRearTires: false,
      seatRows: [1, 1],
    };
  }

  // Trucks with 3+ axles
  if (a >= 4) {
    return {
      vehicleType: 'Camión 4+ ejes',
      tireCount: a * 2 + 2, // dual rear on extra axles
      axleCount: a,
      seatCount: s,
      diagramVariant: 'camion_4e',
      dualRearTires: true,
      seatRows: [2],
    };
  }
  if (a === 3) {
    return {
      vehicleType: 'Camión 3 ejes',
      tireCount: 8,
      axleCount: 3,
      seatCount: s,
      diagramVariant: 'camion_3e',
      dualRearTires: true,
      seatRows: [2],
    };
  }

  // 2-axle vehicles by seat count
  if (s <= 5) {
    return {
      vehicleType: s <= 2 ? 'Automóvil' : 'Automóvil',
      tireCount: 4,
      axleCount: 2,
      seatCount: s,
      diagramVariant: 'auto',
      dualRearTires: false,
      seatRows: s <= 2 ? [2] : [2, Math.ceil((s - 2) / 2), Math.floor((s - 2) / 2)].filter(Boolean),
    };
  }
  if (s <= 8) {
    return {
      vehicleType: 'SUV / Camioneta',
      tireCount: 4,
      axleCount: 2,
      seatCount: s,
      diagramVariant: 'suv',
      dualRearTires: false,
      seatRows: [2, 3, s - 5],
    };
  }
  if (s <= 15) {
    return {
      vehicleType: 'Minivan / Microbús',
      tireCount: 4,
      axleCount: 2,
      seatCount: s,
      diagramVariant: 'minivan',
      dualRearTires: false,
      seatRows: [2, 3, 3, s - 8].filter((n) => n > 0),
    };
  }
  // Bus
  return {
    vehicleType: 'Bus / Buseta',
    tireCount: 6,
    axleCount: 2,
    seatCount: s,
    diagramVariant: 'bus',
    dualRearTires: true,
    seatRows: [2, 4, 4, 4, s - 14].filter((n) => n > 0),
  };
}

// ─── SUV Geometry Constants ───────────────────────────────────────────────────
// Single source of truth for all 6 vehicle diagram views.
// Provisional values for a mid-size SUV.
//
// SCALE: 0.2 px/mm  →  1 mm = 0.2 px
// All px values are derived from the mm measurements below.
// ViewBoxes are NOT changed here; they are fixed by existing hotspot coordinates.
//   lateral:        1000 × 400
//   superior/inferior: 1000 × 420
//   frontal/trasera:    440 × 400

/** Scale factor: pixels per millimetre */
export const SUV_SCALE = 0.2; // px/mm

// ── Real-world measurements (mm) ─────────────────────────────────────────────

/** Overall vehicle length: 4700 mm */
export const SUV_LARGO_MM = 4700;
/** Overall vehicle width: 1900 mm */
export const SUV_ANCHO_MM = 1900;
/** Overall vehicle height: 1700 mm */
export const SUV_ALTO_MM = 1700;
/** Wheelbase (centre-to-centre): 2700 mm */
export const SUV_DIST_EJES_MM = 2700;
/** Front overhang (front bumper to front axle): 900 mm */
export const SUV_VOLADERO_DEL_MM = 900;
/** Rear overhang (rear axle to rear bumper): 1100 mm */
export const SUV_VOLADERO_TRA_MM = 1100;
/** Wheel radius: 350 mm */
export const SUV_RADIO_RUEDA_MM = 350;
/** Tyre width: 225 mm */
export const SUV_ANCHO_LLANTA_MM = 225;
/** Cabin width (glass area, narrower than body): 1500 mm */
export const SUV_ANCHO_CABINA_MM = 1500;

// ── Derived pixel values (lateral view, viewBox 1000 × 400) ──────────────────
// Margin: 30 px each side → body occupies x = 30 … 970 (940 px = 4700 mm × 0.2)

/** Side margin in the lateral viewBox: 30 px */
export const SUV_MARGEN_LATERAL = 30; // px

/** Body start x in lateral view: 30 px  (= SUV_MARGEN_LATERAL) */
export const SUV_CUERPO_X0 = SUV_MARGEN_LATERAL; // 30 px

/** Body end x in lateral view: 970 px  (= 30 + 4700 × 0.2 = 30 + 940) */
export const SUV_CUERPO_X1 = SUV_MARGEN_LATERAL + SUV_LARGO_MM * SUV_SCALE; // 970 px

/** Body length in lateral view: 940 px  (= 4700 × 0.2) */
export const SUV_LARGO_PX = SUV_LARGO_MM * SUV_SCALE; // 940 px

/** Front axle x in lateral view: 210 px  (= 30 + 900 × 0.2 = 30 + 180) */
export const SUV_EJE_DEL_X = SUV_MARGEN_LATERAL + SUV_VOLADERO_DEL_MM * SUV_SCALE; // 210 px

/** Rear axle x in lateral view: 750 px  (= 210 + 2700 × 0.2 = 210 + 540) */
export const SUV_EJE_TRA_X = SUV_EJE_DEL_X + SUV_DIST_EJES_MM * SUV_SCALE; // 750 px

/** Wheelbase in px: 540 px  (= 2700 × 0.2) */
export const SUV_DIST_EJES_PX = SUV_DIST_EJES_MM * SUV_SCALE; // 540 px

/** Wheel radius: 70 px  (= 350 × 0.2) */
export const SUV_RADIO_RUEDA_PX = SUV_RADIO_RUEDA_MM * SUV_SCALE; // 70 px

/** Wheel diameter: 140 px  (= 2 × 70) */
export const SUV_DIAMETRO_RUEDA_PX = SUV_RADIO_RUEDA_PX * 2; // 140 px

/** Body height in lateral view: 340 px  (= 1700 × 0.2) */
export const SUV_ALTO_PX = SUV_ALTO_MM * SUV_SCALE; // 340 px

// ── Derived pixel values (frontal/rear view, viewBox 440 × 400) ───────────────
// Body width 380 px (= 1900 × 0.2); margin 30 px each side → 30 + 380 + 30 = 440 ✓

/** Side margin in frontal/rear viewBox: 30 px */
export const SUV_MARGEN_FRONTAL = 30; // px

/** Body width in frontal/rear view: 380 px  (= 1900 × 0.2) */
export const SUV_ANCHO_CUERPO_PX = SUV_ANCHO_MM * SUV_SCALE; // 380 px

/** Body start x in frontal/rear view: 30 px */
export const SUV_CUERPO_FRONTAL_X0 = SUV_MARGEN_FRONTAL; // 30 px

/** Body end x in frontal/rear view: 410 px  (= 30 + 380) */
export const SUV_CUERPO_FRONTAL_X1 = SUV_MARGEN_FRONTAL + SUV_ANCHO_CUERPO_PX; // 410 px

/** Cabin (glass) width in frontal/rear view: 300 px  (= 1500 × 0.2) */
export const SUV_ANCHO_CABINA_PX = SUV_ANCHO_CABINA_MM * SUV_SCALE; // 300 px

/** Cabin start x in frontal/rear view (centred in 440 px): 70 px  (= (440 − 300) / 2) */
export const SUV_CABINA_X0 = (440 - SUV_ANCHO_CABINA_PX) / 2; // 70 px

/** Cabin end x in frontal/rear view: 370 px  (= 70 + 300) */
export const SUV_CABINA_X1 = SUV_CABINA_X0 + SUV_ANCHO_CABINA_PX; // 370 px

/** Tyre width in frontal/rear view: 45 px  (= 225 × 0.2) */
export const SUV_ANCHO_LLANTA_PX = SUV_ANCHO_LLANTA_MM * SUV_SCALE; // 45 px
