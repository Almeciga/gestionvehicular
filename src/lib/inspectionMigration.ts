import { getDB, type DBInspection } from '@/lib/db';

const MIGRATION_KEY = 'gv_inspections_migrated_to_dexie_v1';

/** Imports the legacy localStorage cache once. It is deliberately non-destructive. */
export async function migrateLegacyInspections(): Promise<void> {
  if (typeof window === 'undefined' || localStorage.getItem(MIGRATION_KEY)) return;
  let legacy: Array<Record<string, unknown>> = [];
  try { legacy = JSON.parse(localStorage.getItem('gv_inspections') || '[]'); } catch { return; }
  if (!Array.isArray(legacy)) return;
  const now = new Date().toISOString();
  const records: DBInspection[] = legacy.filter((item) => item && typeof item === 'object').map((item) => {
    const datos = (item.datos && typeof item.datos === 'object' ? item.datos : {}) as Record<string, unknown>;
    const createdAt = typeof item.createdAt === 'number' ? new Date(item.createdAt).toISOString() : now;
    const updatedAt = typeof item.updatedAt === 'number' ? new Date(item.updatedAt).toISOString() : createdAt;
    return {
      id: crypto.randomUUID(), local_id: typeof item.id === 'string' ? item.id : undefined,
      enterprise_id: typeof item.enterpriseId === 'string' ? item.enterpriseId : undefined,
      placa: String(item.placa || 'S/P'), marca: String(item.marca || 'N/A'), modelo: String(item.modelo || 'N/A'),
      color: String(item.color || 'N/A'), propietario: String(item.propietario || 'N/A'), fecha: String(item.fecha || ''),
      status: item.status === 'completado' ? 'aprobado' : String(item.status || 'activo'),
      secciones_completadas: Number(item.seccionesCompletadas || 0), total_secciones: Number(item.totalSecciones || 0),
      data: datos, inspector_id: typeof item.inspectorId === 'string' ? item.inspectorId : undefined,
      inspector_name: typeof item.inspectorName === 'string' ? item.inspectorName : undefined,
      is_locked: Boolean(item.isLocked), sync_status: 'pending', version: 1, base_version: 1,
      created_at: createdAt, updated_at: updatedAt, creation_timestamp: typeof item.creationTimestamp === 'string' ? item.creationTimestamp : createdAt,
      _dirty: true,
    };
  });
  if (records.length) await getDB().inspections.bulkPut(records);
  localStorage.setItem(MIGRATION_KEY, '1');
}
