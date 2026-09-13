import type { DBInspection } from '@/lib/db';

const VALID_STATUSES = new Set([
  'borrador',
  'activo',
  'pendiente_revision',
  'aprobado',
  'rechazado',
  'finalizado',
  'archivado',
]);

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} es obligatorio.`);
  return value.trim();
}

/** Validates the legacy DD/MM/YYYY value used by the inspection form. */
export function normalizeInspectionDate(value: unknown): string {
  const date = requiredText(value, 'fecha');
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  if (!match) throw new Error('fecha debe tener el formato DD/MM/AAAA.');

  const [, day, month, year] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() !== Number(month) - 1 ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error('fecha no es una fecha válida.');
  }
  return date;
}

function normalizeInspectionData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...data };
  const km = normalized.km;
  if (km === '' || km === null || km === undefined) {
    delete normalized.km;
  } else {
    const numericKm = typeof km === 'number' ? km : Number(String(km).trim());
    if (!Number.isFinite(numericKm) || numericKm < 0 || !Number.isInteger(numericKm)) {
      throw new Error('data.km debe ser un número entero mayor o igual a cero.');
    }
    normalized.km = numericKm;
  }

  if (normalized.combustible !== undefined) {
    const fuel = normalized.combustible;
    if (typeof fuel !== 'number' || !Number.isInteger(fuel) || fuel < 0 || fuel > 4) {
      throw new Error('data.combustible debe ser un entero entre 0 y 4.');
    }
  }
  return normalized;
}

/**
 * Validates database-facing inspection fields and returns a normalized copy.
 * It intentionally does not validate the UI-only shape of every JSON section.
 */
export function validateInspectionChanges(
  changes: Partial<DBInspection>,
  options: { creating: boolean } = { creating: false }
): Partial<DBInspection> {
  const normalized = { ...changes };

  if ('status' in normalized) {
    if (!VALID_STATUSES.has(normalized.status ?? '')) throw new Error('status de inspección inválido.');
    if (!options.creating) throw new Error('El estado solo puede cambiar mediante una transición de inspección.');
  }
  if ('fecha' in normalized) normalized.fecha = normalizeInspectionDate(normalized.fecha);
  if ('secciones_completadas' in normalized || 'total_secciones' in normalized) {
    const completed = normalized.secciones_completadas;
    const total = normalized.total_secciones;
    if (completed !== undefined && (!Number.isInteger(completed) || completed < 0)) {
      throw new Error('secciones_completadas debe ser un entero no negativo.');
    }
    if (total !== undefined && (!Number.isInteger(total) || total <= 0)) {
      throw new Error('total_secciones debe ser un entero mayor que cero.');
    }
    if (completed !== undefined && total !== undefined && completed > total) {
      throw new Error('secciones_completadas no puede superar total_secciones.');
    }
  }
  if ('data' in normalized) {
    if (!normalized.data || Array.isArray(normalized.data) || typeof normalized.data !== 'object') {
      throw new Error('data debe ser un objeto válido.');
    }
    normalized.data = normalizeInspectionData(normalized.data);
  }
  if (options.creating) {
    for (const field of ['placa', 'marca', 'modelo', 'color', 'propietario'] as const) {
      normalized[field] = requiredText(normalized[field], field);
    }
    if (!normalized.data) throw new Error('data es obligatorio.');
    if (normalized.secciones_completadas === undefined || normalized.total_secciones === undefined) {
      throw new Error('Las secciones de la inspección son obligatorias.');
    }
  }
  return normalized;
}
