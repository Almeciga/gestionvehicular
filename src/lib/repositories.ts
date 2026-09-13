import {
  getDB,
  type DBVehicle,
  type DBMaterial,
  type DBInspection,
  type DBProfile,
} from '@/lib/db';
import { enqueueOperation } from '@/lib/syncService';
import { createClient } from '@/lib/supabase/client';
import { validateInspectionChanges } from '@/lib/inspectionValidation';

function isOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

export type TransitionResult = { ok: true } | { ok: false; error: string };

/**
 * Ejecuta una transición de estado. Si hay conexión, llama la RPC directamente
 * (que valida rol y estado de origen en el servidor) y aplica el resultado
 * localmente. Si no hay conexión, aplica el cambio localmente de forma
 * optimista y encola la RPC para que syncService la ejecute al reconectar.
 */
async function runTransition(id: string, rpcName: string,rpcArgs: Record<string, unknown>, optimisticChanges: Partial<DBInspection>
): Promise<TransitionResult> {
  const db = getDB();
  const existing = await db.inspections.get(id);
  if (!existing) return { ok: false, error: 'Inspección local no encontrada.' };
  const now = new Date().toISOString();

  if (isOnline()) {
    const supabase = createClient();
    const { error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      return { ok: false, error: error.message };
    }
    // La RPC modificó el registro remoto; el trigger de Supabase incrementó
    // su version. Sin este refresh, la siguiente edición normal compararía
    // contra un base_version desactualizado y generaría falsos "conflictos".
    const { data: refreshed, error: refreshError } = await supabase
      .from('inspections').select('*').eq('id', id).maybeSingle();
    if (!refreshError && refreshed) {
      const remote = refreshed as DBInspection;
      await db.inspections.put({ ...remote, _synced_at: Date.now(), _dirty: false, sync_status: 'synced', base_version: remote.version ?? 1 });
    } else {
      // The transition already succeeded. Preserve an honest local pending state
      // instead of claiming server generated metadata was synchronized.
      await db.inspections.update(id, { ...optimisticChanges, updated_at: now, sync_status: 'pending', _dirty: true });
    }
    return { ok: true };
  }

  // Offline: aplicar optimista + encolar para ejecutar la RPC al reconectar
  await db.inspections.update(id, {
    ...optimisticChanges,
    updated_at: now,
    sync_status: 'pending',
    _dirty: true,
  });
  await enqueueOperation('inspections', 'RPC', id, {
    rpc_name: rpcName,
    rpc_args: rpcArgs,
  });
  return { ok: true };
}

// ─── Profiles Repository ──────────────────────────────────────────────────────

export const ProfilesRepo = {
  async getAll(): Promise<DBProfile[]> {
    const db = getDB();
    return db.profiles.orderBy('email').toArray();
  },

  async getById(id: string): Promise<DBProfile | undefined> {
    const db = getDB();
    return db.profiles.get(id);
  },

  async getByEmail(email: string): Promise<DBProfile | undefined> {
    const db = getDB();
    return db.profiles.where('email').equals(email).first();
  },

  async upsert(profile: DBProfile): Promise<void> {
    const db = getDB();
    await db.profiles.put(profile);
  },

  async update(id: string, changes: Partial<DBProfile>): Promise<void> {
    const db = getDB();
    const now = new Date().toISOString();
    const updated = { ...changes, updated_at: now, _dirty: true };
    await db.profiles.update(id, updated);
    // Strip local-only bookkeeping fields before enqueueing for Supabase sync
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = updated as Record<string, unknown>;
    await enqueueOperation('profiles', 'UPDATE', id, cleanPayload);
  },

  async count(): Promise<number> {
    const db = getDB();
    return db.profiles.count();
  },
};

// ─── Vehicles Repository ──────────────────────────────────────────────────────

export const VehiclesRepo = {
  async getAll(): Promise<DBVehicle[]> {
    const db = getDB();
    return db.vehicles.orderBy('updated_at').reverse().toArray();
  },

  async getById(id: string): Promise<DBVehicle | undefined> {
    const db = getDB();
    return db.vehicles.get(id);
  },

  async getByPlaca(placa: string): Promise<DBVehicle | undefined> {
    const db = getDB();
    return db.vehicles.where('placa').equals(placa).first();
  },

  async search(query: string): Promise<DBVehicle[]> {
    const db = getDB();
    const q = query.toLowerCase();
    return db.vehicles.filter((v) => v.placa?.toLowerCase().includes(q) || v.marca?.toLowerCase().includes(q) || v.propietario?.toLowerCase().includes(q)
    ) .toArray();
  },

  async create(vehicle: Omit<DBVehicle, '_synced_at' | '_dirty'>): Promise<DBVehicle> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBVehicle = {
      ...vehicle,
      created_at: vehicle.created_at || now,
      updated_at: now,
      _dirty: true,
      _synced_at: undefined,
    };
    await db.vehicles.put(record);
    // Strip local-only bookkeeping fields before enqueueing for Supabase sync
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = record as unknown as Record<string, unknown>;
    await enqueueOperation('vehicles', 'INSERT', record.id, cleanPayload);
    return record;
  },

  async update(id: string, changes: Partial<DBVehicle>): Promise<void> {
    const db = getDB();
    const now = new Date().toISOString();
    const updated = { ...changes, updated_at: now, _dirty: true };
    await db.vehicles.update(id, updated);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = updated as Record<string, unknown>;
    await enqueueOperation('vehicles', 'UPDATE', id, cleanPayload);
  },

  async delete(id: string): Promise<void> {
    const db = getDB();
    await db.vehicles.delete(id);
    await enqueueOperation('vehicles', 'DELETE', id, { id });
  },

  async count(): Promise<number> {
    const db = getDB();
    return db.vehicles.count();
  },
};

// ─── Materials Repository ─────────────────────────────────────────────────────

export const MaterialsRepo = {
  async getAll(): Promise<DBMaterial[]> {
    const db = getDB();
    return db.materials.orderBy('updated_at').reverse().toArray();
  },

  async getById(id: string): Promise<DBMaterial | undefined> {
    const db = getDB();
    return db.materials.get(id);
  },

  async getByCategoria(categoria: string): Promise<DBMaterial[]> {
    const db = getDB();
    return db.materials.where('categoria').equals(categoria).toArray();
  },

  async search(query: string): Promise<DBMaterial[]> {
    const db = getDB();
    const q = query.toLowerCase();
    return db.materials.filter((m) => m.nombre?.toLowerCase().includes(q) || m.categoria?.toLowerCase().includes(q)).toArray();
  },

  async create(material: Omit<DBMaterial, '_synced_at' | '_dirty'>): Promise<DBMaterial> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBMaterial = {
      ...material,
      created_at: material.created_at || now,
      updated_at: now,
      _dirty: true,
      _synced_at: undefined,
    };
    await db.materials.put(record);
    // Strip local-only bookkeeping fields before enqueueing for Supabase sync
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = record as unknown as Record<string, unknown>;
    await enqueueOperation('materials', 'INSERT', record.id, cleanPayload);
    return record;
  },

  async update(id: string, changes: Partial<DBMaterial>): Promise<void> {
    const db = getDB();
    const now = new Date().toISOString();
    const updated = { ...changes, updated_at: now, _dirty: true };
    await db.materials.update(id, updated);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = updated as Record<string, unknown>;
    await enqueueOperation('materials', 'UPDATE', id, cleanPayload);
  },

  async delete(id: string): Promise<void> {
    const db = getDB();
    await db.materials.delete(id);
    await enqueueOperation('materials', 'DELETE', id, { id });
  },

  async count(): Promise<number> {
    const db = getDB();
    return db.materials.count();
  },
};

// ─── Inspections Repository ───────────────────────────────────────────────────

export const InspectionsRepo = {
  async getAll(): Promise<DBInspection[]> {
    const db = getDB();
    return db.inspections.orderBy('updated_at').reverse().toArray();
  },

  async getById(id: string): Promise<DBInspection | undefined> {
    const db = getDB();
    return db.inspections.get(id);
  },

  async getByLocalId(localId: string): Promise<DBInspection | undefined> {
    const db = getDB();
    return db.inspections.where('local_id').equals(localId).first();
  },

  async getByInspector(inspectorId: string): Promise<DBInspection[]> {
    const db = getDB();
    return db.inspections.where('inspector_id').equals(inspectorId).reverse().sortBy('updated_at');
  },

  async getOpenForVehicle(vehicleId: string): Promise<DBInspection | undefined> {
    const db = getDB();
    return db.inspections
      .filter((inspection) => {
        const data = inspection.data as Record<string, unknown>;
        return data?.vehicleId === vehicleId && inspection.status !== 'finalizado' && inspection.status !== 'archivado';
      })
      .first();
  },

  async search(query: string, status?: string): Promise<DBInspection[]> {
    const db = getDB();
    const q = query.toLowerCase();
    return db.inspections.filter((i): boolean => {const matchQuery = !q || Boolean(i.placa?.toLowerCase().includes(q) || i.propietario?.toLowerCase().includes(q) || i.marca?.toLowerCase().includes(q) || i.enterprise_id?.toLowerCase().includes(q) || i.inspector_name?.toLowerCase().includes(q));const matchStatus = !status || status === 'all' || i.status === status;return matchQuery && matchStatus;}).toArray();
  },

  async create(inspection: Omit<DBInspection, '_synced_at' | '_dirty' | 'version' | 'base_version'>
  ): Promise<DBInspection> {
    const db = getDB();
    const now = new Date().toISOString();
    const validated = validateInspectionChanges(inspection, { creating: true });
    const record: DBInspection = {
      ...validated as DBInspection,
      created_at: inspection.created_at || now,
      updated_at: now,
      sync_status: 'pending',
      version: 1,
      base_version: 1,
      _dirty: true,
      _synced_at: undefined,
    };
    await db.inspections.put(record);
    // Strip local-only bookkeeping fields before enqueueing for Supabase sync
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = record as unknown as Record<string, unknown>;
    await enqueueOperation('inspections', 'INSERT', record.id, cleanPayload);
    return record;
  },

  async update(id: string, changes: Partial<DBInspection>): Promise<void> {
    const db = getDB();
    const existing = await db.inspections.get(id);
    if (!existing) throw new Error('Inspección local no encontrada.');
    const validated = validateInspectionChanges(changes);
    if (
      validated.secciones_completadas !== undefined &&
      validated.secciones_completadas > (validated.total_secciones ?? existing.total_secciones)
    ) throw new Error('secciones_completadas no puede superar total_secciones.');
    if (
      validated.total_secciones !== undefined &&
      (validated.secciones_completadas ?? existing.secciones_completadas) > validated.total_secciones
    ) throw new Error('total_secciones no puede ser menor que secciones_completadas.');
    const now = new Date().toISOString();
    const updated = { ...validated, updated_at: now, _dirty: true };
    await db.inspections.update(id, updated);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = updated as Record<string, unknown>;

    // Snapshot de los valores previos de los campos que cambian + version
    // conocida al momento de la edición. syncService los usa para decidir
    // si un conflicto remoto realmente choca con estos campos o si puede
    // auto-mergear con seguridad. Se limpian antes de llegar a Supabase.
    const previousValues: Record<string, unknown> = {};
    if (existing) {
      Object.keys(validated).forEach((k) => {
        previousValues[k] = (existing as unknown as Record<string, unknown>)[k];
      });
    }

    await enqueueOperation('inspections', 'UPDATE', id, {
      ...cleanPayload,
      _previous: previousValues,
      _base_version: existing?.base_version ?? existing?.version ?? 1,
    });
  },

  async delete(id: string): Promise<void> {
    const db = getDB();
    await db.inspections.delete(id);
    await enqueueOperation('inspections', 'DELETE', id, { id });
  },

  async count(): Promise<number> {
    const db = getDB();
    return db.inspections.count();
  },

  async countByStatus(status: string): Promise<number> {
    const db = getDB();
    return db.inspections.where('status').equals(status).count();
  },

  // ── Transiciones de estado ──────────────────────────────────────────────
  // Único punto de entrada para cambios de status. Nunca usar update() para
  // esto: la BD tiene un guard que rechaza cambios de status fuera de estas RPC.

  async submitForReview(id: string): Promise<TransitionResult> {
    return runTransition(id, 'submit_for_review', { p_inspection_id: id }, {status: 'pendiente_revision',});
  },

  async approve(id: string): Promise<TransitionResult> {
    return runTransition(id, 'approve_inspection', { p_inspection_id: id }, {status: 'aprobado',});
  },

  async reject(id: string, reason: string): Promise<TransitionResult> {
    const optimisticChanges: Partial<DBInspection> = {
      status: 'rechazado',
      rejection_reason: reason,
    };
    return runTransition(
        id,
        'reject_inspection',
        { p_inspection_id: id, p_reason: reason },
        optimisticChanges
    );
  },

  async finalize(id: string): Promise<TransitionResult> {
    return runTransition(id, 'finalize_inspection', { p_inspection_id: id }, {
      status: 'finalizado',
      is_locked: true,
    });
  },

  async unlock(id: string, reason: string): Promise<TransitionResult> {
    const optimisticChanges: Partial<DBInspection> = {
      status: 'activo',
      is_locked: false,
      unlock_reason: reason,
    };
    return runTransition(
        id,
        'admin_unlock_inspection',
        { p_inspection_id: id, p_reason: reason },
        optimisticChanges
    );
  },

  async archive(id: string): Promise<TransitionResult> {
    return runTransition(id, 'archive_inspection', { p_inspection_id: id }, {
      status: 'archivado',
    });
  },
};

export const POCatalogRepo = {
  bulkUpsertCatalogs: async (..._args: any[]): Promise<void> => {
    // Placeholder: IndexedDB catalog cache not implemented yet
  },
};
function ProductionOrdersRepo(...args: any[]): any {
  // eslint-disable-next-line no-console
  console.warn('Placeholder: ProductionOrdersRepo is not implemented yet.', args);
  return null;
}

export { ProductionOrdersRepo };