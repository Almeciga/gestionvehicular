import type { DBInspection } from '@/lib/db';

export interface InspectionAuditEntry {
  action: string;
  performedByName?: string;
  details?: string;
  timestamp: string;
}

/** Shape consumed by the existing inspection UI. Persistence stays snake_case in Dexie/Supabase. */
export interface InspectionView {
  id: string; enterpriseId?: string; placa: string; marca: string; modelo: string; color: string;
  propietario: string; fecha: string; status: string; seccionesCompletadas: number;
  totalSecciones: number; datos: Record<string, unknown>; inspectorId?: string; inspectorName?: string;
  isLocked?: boolean; finalizedAt?: string; finalizedBy?: string; unlockedAt?: string;
  unlockedBy?: string; unlockReason?: string; approvedAt?: string; approvedBy?: string;
  rejectedAt?: string; rejectedBy?: string; rejectionReason?: string;
  finalizedSnapshot?: Record<string, unknown>; creationTimestamp?: string;
  finalizationTimestamp?: string; syncStatus?: DBInspection['sync_status'];
  auditLog?: InspectionAuditEntry[];
}

export const EDITABLE_STATUSES = ['borrador', 'activo', 'rechazado'];

export function toInspectionView(row: DBInspection): InspectionView {
  return {
    id: row.id, enterpriseId: row.enterprise_id, placa: row.placa, marca: row.marca,
    modelo: row.modelo, color: row.color, propietario: row.propietario, fecha: row.fecha,
    status: row.status, seccionesCompletadas: row.secciones_completadas,
    totalSecciones: row.total_secciones, datos: row.data ?? {}, inspectorId: row.inspector_id,
    inspectorName: row.inspector_name, isLocked: row.is_locked, finalizedAt: row.finalized_at,
    finalizedBy: row.finalized_by, unlockedAt: row.unlocked_at, unlockedBy: row.unlocked_by,
    unlockReason: row.unlock_reason, approvedAt: row.approved_at, approvedBy: row.approved_by,
    rejectedAt: row.rejected_at, rejectedBy: row.rejected_by, rejectionReason: row.rejection_reason,
    finalizedSnapshot: row.finalized_snapshot, creationTimestamp: row.creation_timestamp,
    finalizationTimestamp: row.finalization_timestamp, syncStatus: row.sync_status,
  };
}
