// ─── Types ────────────────────────────────────────────────────────────────────
export interface Vehicle {
  id: string;
  marca: string;
  modelo: string;
  color: string;
  placa: string;
  vin: string;
  propietario: string;
  fechaCreacion: string;
  materials: MaterialRow[];
  createdAt: number;
}

export interface MaterialRow {
  id: string;
  nombre: string;
  cantidad: string;
  unidad: string;
  fotos: string[];
}

export type InspectionStatus =
    | 'borrador'
    | 'activo' |'completado' |'pendiente_revision' |'aprobado' |'rechazado' |'finalizado' |'archivado';

// Statuses in which the inspector is allowed to edit content.
// Anything outside this set is read-only for the inspector (and for admins,
// who act on the record via approve/reject/finalize/archive/unlock instead
// of editing content directly).
export const EDITABLE_STATUSES: InspectionStatus[] = ['borrador', 'activo', 'rechazado'];

export interface Inspection {
  id: string;
  enterpriseId?: string; // BT-2026-XXXXXX
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  propietario: string;
  fecha: string;
  status: InspectionStatus;
  seccionesCompletadas: number;
  totalSecciones: number;
  datos: Record<string, unknown>;
  createdAt: number;
  updatedAt?: number;
  // Legal evidence fields
  inspectorId?: string;
  inspectorName?: string;
  isLocked?: boolean;
  finalizedAt?: number;
  finalizedBy?: string;
  unlockedAt?: number;
  unlockedBy?: string;
  unlockReason?: string;
  archivedAt?: number;
  archivedBy?: string;
  approvedAt?: number;
  approvedBy?: string;
  rejectedAt?: number;
  rejectedBy?: string;
  rejectionReason?: string;
  creationTimestamp?: string;
  finalizationTimestamp?: string;
  // Immutable snapshot of finalized data
  finalizedSnapshot?: Record<string, unknown>;
  // Audit trail
  auditLog?: AuditEntry[];
  // Sync status
  syncStatus?: 'pending' | 'synced' | 'failed';
  lastSyncedAt?: number;
}

export interface AuditEntry {
  action:
      | 'created' |'updated' |'finalized' |'unlocked' |'archived' |'pdf_generated' |'approved' |'rejected' |'submitted_for_review' |'media_uploaded' |'media_deleted' |'admin_action' |'transition_blocked';
  performedBy: string;
  performedByName?: string;
  timestamp: string;
  details?: string;
  previousValue?: unknown;
  newValue?: unknown;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const VEHICLES_KEY = 'gv_vehicles';
const INSPECTIONS_KEY = 'gv_inspections';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full — try to clear old data
    try {
      const items = readJSON<T[]>(key, [] as unknown as T[]);
      if (Array.isArray(items) && items.length > 100) {
        // Keep only the 80 most recent
        const trimmed = (items as unknown[]).slice(0, 80);
        localStorage.setItem(key, JSON.stringify(trimmed));
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch { /* silently ignore */ }
  }
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function appendAuditEntry(existing: AuditEntry[] | undefined, entry: AuditEntry): AuditEntry[] {
  return [...(existing || []), entry];
}

// ─── Vehicles API ─────────────────────────────────────────────────────────────
// NOTE: Vehicles are managed via VehiclesRepo (IndexedDB + Supabase sync) in
// src/lib/repositories.ts. These localStorage-based helpers are legacy and
// are not used by VehicleProductionForm/View — kept only for backward
// compatibility in case anything else still references them.

export function getVehicles(): Vehicle[] {
  return readJSON<Vehicle[]>(VEHICLES_KEY, []);
}

export function saveVehicle(data: Omit<Vehicle, 'id' | 'createdAt'>): Vehicle {
  const vehicles = getVehicles();
  const vehicle: Vehicle = {
    ...data,
    id: generateId('veh'),
    createdAt: Date.now(),
  };
  writeJSON(VEHICLES_KEY, [vehicle, ...vehicles]);
  return vehicle;
}

export function updateVehicle(id: string, data: Partial<Omit<Vehicle, 'id' | 'createdAt'>>): Vehicle | null {
  const vehicles = getVehicles();
  const idx = vehicles.findIndex((v) => v.id === id);
  if (idx === -1) return null;
  vehicles[idx] = { ...vehicles[idx], ...data };
  writeJSON(VEHICLES_KEY, vehicles);
  return vehicles[idx];
}

export function deleteVehicle(id: string): void {
  const vehicles = getVehicles().filter((v) => v.id !== id);
  writeJSON(VEHICLES_KEY, vehicles);
}

// ─── Inspections API ──────────────────────────────────────────────────────────

export function getInspections(): Inspection[] {
  return readJSON<Inspection[]>(INSPECTIONS_KEY, []);
}

export function replaceInspections(inspections: Inspection[]): void {
  writeJSON(INSPECTIONS_KEY, inspections);
}

/** Returns the currently "open" inspection for a vehicle, if any — i.e. one
 * that hasn't reached a terminal state (finalizado/archivado). Used to block
 * starting a second inspection for the same vehicle while one is in flight,
 * and to block editing that vehicle from Producción while it's mid-inspection. */
export function getOpenInspectionForVehicle(vehicleId: string): Inspection | null {
  const all = getInspections();
  const open = all.find((i) => {
    const datos = i.datos as Record<string, unknown>;
    return datos?.vehicleId === vehicleId && i.status !== 'finalizado' && i.status !== 'archivado';
  });
  return open || null;
}

export function saveInspection(data: Omit<Inspection, 'id' | 'createdAt'>): Inspection {
  const inspections = getInspections();
  const now = Date.now();

  // Generate enterprise ID if not provided
  let enterpriseId = data.enterpriseId;
  if (!enterpriseId) {
    // Import lazily to avoid SSR issues
    try {
      const year = new Date().getFullYear();
      const COUNTER_KEY = 'gv_inspection_counter';
      const raw = localStorage.getItem(COUNTER_KEY);
      const counter = raw ? parseInt(raw, 10) : 1;
      localStorage.setItem(COUNTER_KEY, String(counter + 1));
      enterpriseId = `BT-${year}-${String(counter).padStart(6, '0')}`;
    } catch {
      enterpriseId = `BT-${new Date().getFullYear()}-${String(inspections.length + 1).padStart(6, '0')}`;
    }
  }

  const inspection: Inspection = {
    ...data,
    status: 'activo', // always starts "in process" — status is never manually set on create
    id: generateId('insp'),
    enterpriseId,
    createdAt: now,
    updatedAt: now,
    creationTimestamp: new Date(now).toISOString(),
    syncStatus: 'pending',
    auditLog: appendAuditEntry(undefined, {
      action: 'created',
      performedBy: data.inspectorId || 'unknown',
      performedByName: data.inspectorName,
      timestamp: new Date(now).toISOString(),
      details: `Inspección creada — ID: ${enterpriseId}`,
    }),
  };
  writeJSON(INSPECTIONS_KEY, [inspection, ...inspections]);
  return inspection;
}

export function updateInspection(
    id: string,
    data: Partial<Omit<Inspection, 'id' | 'createdAt'>>,
    performedBy?: string,
    performedByName?: string
): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;

  // Keys that represent a status transition performed by dedicated functions
  // below (approve/reject/finalize/unlock/archive) rather than a content edit.
  const transitionKeys = ['isLocked', 'status', 'approvedAt', 'approvedBy', 'rejectedAt', 'rejectedBy', 'rejectionReason', 'syncStatus', 'lastSyncedAt'];
  const isTransitionOnly = Object.keys(data).every((k) => transitionKeys.includes(k));

  // Block content edits when the inspection isn't in an editable state —
  // covers both the legacy isLocked flag and the current status.
  const currentStatus = inspections[idx].status;
  const contentIsEditable = EDITABLE_STATUSES.includes(currentStatus) && !inspections[idx].isLocked;
  if (!contentIsEditable && !isTransitionOnly) {
    return null; // silently reject content edits outside editable states
  }

  const now = Date.now();
  const auditEntry: AuditEntry = {
    action: 'updated',
    performedBy: performedBy || 'unknown',
    performedByName,
    timestamp: new Date(now).toISOString(),
  };
  inspections[idx] = {
    ...inspections[idx],
    ...data,
    updatedAt: now,
    auditLog: appendAuditEntry(inspections[idx].auditLog, auditEntry),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

/** Inspector: submit for admin review. Only allowed from an editable state
 * (activo/borrador/rechazado) — cannot be called on records already in
 * review or beyond. */
export function submitForReview(id: string, inspectorId: string, inspectorName?: string): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  if (!EDITABLE_STATUSES.includes(inspections[idx].status)) return null;
  const now = Date.now();
  inspections[idx] = {
    ...inspections[idx],
    status: 'pendiente_revision',
    updatedAt: now,
    auditLog: appendAuditEntry(inspections[idx].auditLog, {
      action: 'submitted_for_review',
      performedBy: inspectorId,
      performedByName: inspectorName,
      timestamp: new Date(now).toISOString(),
    }),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

/** Admin only: approve an inspection. Approve = Completada in a single step.
 * Only allowed from 'pendiente_revision'. */
export function approveInspection(id: string, adminId: string, adminName?: string): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  if (inspections[idx].status !== 'pendiente_revision') return null;
  const now = Date.now();
  inspections[idx] = {
    ...inspections[idx],
    status: 'completado',
    approvedAt: now,
    approvedBy: adminId,
    updatedAt: now,
    auditLog: appendAuditEntry(inspections[idx].auditLog, {
      action: 'approved',
      performedBy: adminId,
      performedByName: adminName,
      timestamp: new Date(now).toISOString(),
      details: 'Aprobada y marcada como Completada',
    }),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

/** Admin only: reject an inspection with reason. Only allowed from
 * 'pendiente_revision'. Sends it back to the inspector for correction. */
export function rejectInspection(id: string, adminId: string, reason: string, adminName?: string): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  if (inspections[idx].status !== 'pendiente_revision') return null;
  if (!reason || reason.trim().length < 5) return null;
  const now = Date.now();
  inspections[idx] = {
    ...inspections[idx],
    status: 'rechazado',
    isLocked: false,
    rejectedAt: now,
    rejectedBy: adminId,
    rejectionReason: reason,
    updatedAt: now,
    auditLog: appendAuditEntry(inspections[idx].auditLog, {
      action: 'rejected',
      performedBy: adminId,
      performedByName: adminName,
      timestamp: new Date(now).toISOString(),
      details: `Razón: ${reason}`,
    }),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

/** Admin only: finalize an inspection — locks it permanently and creates an
 * immutable snapshot. Only allowed from 'completado'. Once finalized, nobody
 * (including admin) can edit content without going through unlockInspection. */
export function finalizeInspection(id: string, adminId: string, adminName: string): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  if (inspections[idx].status !== 'completado') return null;
  const now = Date.now();
  const auditEntry: AuditEntry = {
    action: 'finalized',
    performedBy: adminId,
    performedByName: adminName,
    timestamp: new Date(now).toISOString(),
    details: `Inspección finalizada y bloqueada — ID: ${inspections[idx].enterpriseId || id}`,
  };
  inspections[idx] = {
    ...inspections[idx],
    status: 'finalizado',
    isLocked: true,
    finalizedAt: now,
    finalizedBy: adminId,
    finalizationTimestamp: new Date(now).toISOString(),
    updatedAt: now,
    // Create immutable snapshot of the finalized state
    finalizedSnapshot: { ...inspections[idx].datos },
    auditLog: appendAuditEntry(inspections[idx].auditLog, auditEntry),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

/** Admin-only exception: unlock a finalized inspection with required reason.
 * Sends it back to 'activo' so the inspector can correct it and resubmit
 * through the full review pipeline again. Every use is audited. */
export function unlockInspection(id: string, adminId: string, reason: string, adminName?: string): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  if (inspections[idx].status !== 'finalizado') return null;
  if (!reason || reason.trim().length < 5) return null; // reason required
  const now = Date.now();
  const auditEntry: AuditEntry = {
    action: 'unlocked',
    performedBy: adminId,
    performedByName: adminName,
    timestamp: new Date(now).toISOString(),
    details: `Admin unlock (excepción) — Razón: ${reason}`,
  };
  inspections[idx] = {
    ...inspections[idx],
    isLocked: false,
    status: 'activo',
    unlockedAt: now,
    unlockedBy: adminId,
    unlockReason: reason,
    updatedAt: now,
    auditLog: appendAuditEntry(inspections[idx].auditLog, auditEntry),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

/** Admin only: archive a finalized inspection. Only allowed from 'finalizado'. */
export function archiveInspection(id: string, adminId: string, adminName?: string): Inspection | null {
  const inspections = getInspections();
  const idx = inspections.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  if (inspections[idx].status !== 'finalizado') return null;
  const now = Date.now();
  const auditEntry: AuditEntry = {
    action: 'archived',
    performedBy: adminId,
    performedByName: adminName,
    timestamp: new Date(now).toISOString(),
  };
  inspections[idx] = {
    ...inspections[idx],
    status: 'archivado',
    archivedAt: now,
    archivedBy: adminId,
    updatedAt: now,
    auditLog: appendAuditEntry(inspections[idx].auditLog, auditEntry),
  };
  writeJSON(INSPECTIONS_KEY, inspections);
  return inspections[idx];
}

export function deleteInspection(id: string): void {
  const inspections = getInspections().filter((i) => i.id !== id);
  writeJSON(INSPECTIONS_KEY, inspections);
}

// ─── Search API ───────────────────────────────────────────────────────────────

export interface SearchFilters {
  query?: string;
  status?: InspectionStatus | 'all';
  dateFrom?: string;
  dateTo?: string;
}

export function searchInspections(filters: SearchFilters): Inspection[] {
  const all = getInspections();
  const q = (filters.query || '').toLowerCase().trim();

  return all.filter((insp) => {
    // Text search: plate, VIN, owner, enterprise ID, inspector
    if (q) {
      const searchable = [
        insp.placa,
        insp.propietario,
        insp.marca,
        insp.modelo,
        insp.enterpriseId || '',
        insp.inspectorName || '',
        (insp.datos as Record<string, unknown>)?.vin as string || '',
      ].join(' ').toLowerCase();
      if (!searchable.includes(q)) return false;
    }

    // Status filter
    if (filters.status && filters.status !== 'all' && insp.status !== filters.status) {
      return false;
    }

    return true;
  });
}
