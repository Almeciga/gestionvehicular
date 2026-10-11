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
