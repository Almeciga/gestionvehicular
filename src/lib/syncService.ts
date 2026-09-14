import { createClient } from '@/lib/supabase/client';
import { getDB, getLastSync, setLastSync, type DBSyncQueueItem } from '@/lib/db';
import type { DBVehicle, DBMaterial, DBInspection, DBProfile } from '@/lib/db';

// ─── Observability Metrics ────────────────────────────────────────────────────

export interface SyncMetrics {
  startTime: number;
  endTime?: number;
  downloadedRows: number;
  uploadedRows: number;
  failedRows: number;
  pendingQueueSize: number;
  cacheHits: number;
  supabaseRequests: number;
  lastSyncDuration?: number;
}

const _metrics: SyncMetrics = {
  startTime: Date.now(),
  downloadedRows: 0,
  uploadedRows: 0,
  failedRows: 0,
  pendingQueueSize: 0,
  cacheHits: 0,
  supabaseRequests: 0,
};

export function getMetrics(): SyncMetrics {
  return { ..._metrics };
}

function trackRequest() {
  _metrics.supabaseRequests++;
}

type RemoteInspectionRow = Record<string, unknown> & {
  id: string;
  version?: number;
};

function isRemoteInspectionRow(row: Record<string, unknown>): row is RemoteInspectionRow {
  return typeof row.id === 'string' && row.id.length > 0;
}

function toSyncedInspection(row: RemoteInspectionRow, syncedAt: number): DBInspection {
  return {
    ...row,
    _synced_at: syncedAt,
    _dirty: false,
    sync_status: 'synced',
    version: row.version ?? 1,
    base_version: row.version ?? 1,
  } as DBInspection;
}

// ─── Columnas reales de la tabla inspections ─────────────────────────────────
const INSPECTION_TOP_LEVEL_COLUMNS = new Set([
  'placa', 'marca', 'modelo', 'color', 'propietario', 'fecha',
  'secciones_completadas', 'total_secciones', 'inspector_id',
  'inspector_name', 'data', 'updated_at', 'sync_status',
  'is_locked', 'rejection_reason', 'unlock_reason',
]);

// ─── Initial Data Download (on login) ────────────────────────────────────────

export async function initialDataDownload(): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const db = getDB();

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const syncStart = Date.now();

    _metrics.startTime = syncStart;
    _metrics.supabaseRequests = 0;
    _metrics.downloadedRows = 0;

    trackRequest();
    trackRequest();
    trackRequest();
    trackRequest();
    const [profilesRes, vehiclesRes, materialsRes, inspectionsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('vehicles').select('*').order('updated_at', { ascending: false }),
      supabase.from('materials').select('*').order('updated_at', { ascending: false }),
      supabase.from('inspections').select('*').order('updated_at', { ascending: false }),
    ]);

    const now = Date.now();

    if (profilesRes.data && !profilesRes.error) {
      const profiles = (profilesRes.data as Record<string, unknown>[]).map((p) => ({
        ...p,
        _synced_at: now,
      })) as DBProfile[];
      await db.profiles.bulkPut(profiles);
      _metrics.downloadedRows += profiles.length;
      await setLastSync('profiles', now);
    }

    if (vehiclesRes.data && !vehiclesRes.error) {
      const vehicles = (vehiclesRes.data as Record<string, unknown>[]).map((v) => ({
        ...v,
        _synced_at: now,
        _dirty: false,
      })) as DBVehicle[];
      await db.vehicles.bulkPut(vehicles);
      _metrics.downloadedRows += vehicles.length;
      await setLastSync('vehicles', now);
    }

    if (materialsRes.data && !materialsRes.error) {
      const materials = (materialsRes.data as Record<string, unknown>[]).map((m) => ({
        ...m,
        _synced_at: now,
        _dirty: false,
      })) as DBMaterial[];
      await db.materials.bulkPut(materials);
      _metrics.downloadedRows += materials.length;
      await setLastSync('materials', now);
    }

    if (inspectionsRes.data && !inspectionsRes.error) {
      const remoteRows = (inspectionsRes.data as Record<string, unknown>[])
          .filter(isRemoteInspectionRow);
      const ids = remoteRows.map((r) => r.id);
      const localRows = await db.inspections.bulkGet(ids);
      const toUpsert: DBInspection[] = [];
      remoteRows.forEach((r, idx) => {
        const local = localRows[idx];
        if (local && local._dirty) {
          return;
        }
        toUpsert.push(toSyncedInspection(r, now));
      });
      if (toUpsert.length) await db.inspections.bulkPut(toUpsert);
      _metrics.downloadedRows += toUpsert.length;
      await setLastSync('inspections', now);
    }

    _metrics.endTime = Date.now();
    _metrics.lastSyncDuration = _metrics.endTime - syncStart;

    if (typeof window !== 'undefined') window.dispatchEvent(new Event('gv-sync-complete'));
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SyncService] Initial download failed:', error);
    return { success: false, error };
  }
}

// ─── Incremental Sync (smart delta sync) ─────────────────────────────────────

export async function incrementalSync(
    tables?: string[]
): Promise<{ success: boolean; downloaded: number; error?: string }> {
  const supabase = createClient();
  const db = getDB();
  const targetTables = tables ?? ['profiles', 'vehicles', 'materials', 'inspections'];

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, downloaded: 0, error: 'Not authenticated' };

    let totalDownloaded = 0;
    const now = Date.now();

    for (const tableName of targetTables) {
      const lastSync = await getLastSync(tableName);
      const lastSyncISO = lastSync > 0 ? new Date(lastSync).toISOString() : '1970-01-01T00:00:00Z';

      trackRequest();
      const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .gt('updated_at', lastSyncISO)
          .order('updated_at', { ascending: true });

      if (error) {
        console.warn(`[SyncService] Incremental sync failed for ${tableName}:`, error.message);
        continue;
      }

      if (!data || data.length === 0) {
        continue;
      }

      const records: Array<Record<string, unknown>> = (data as Record<string, unknown>[]).map((r) => ({
        ...r,
        _synced_at: now,
        _dirty: false,
      }));
      let appliedCount = records.length;

      switch (tableName) {
        case 'profiles':
          await db.profiles.bulkPut(records as unknown as DBProfile[]);
          break;
        case 'vehicles':
          await db.vehicles.bulkPut(records as unknown as DBVehicle[]);
          break;
        case 'materials':
          await db.materials.bulkPut(records as unknown as DBMaterial[]);
          break;
        case 'inspections': {
          const inspectionRecords = records.filter(isRemoteInspectionRow);
          const ids = inspectionRecords.map((r) => r.id);
          const localRows = await db.inspections.bulkGet(ids);
          const toUpsert: DBInspection[] = [];
          inspectionRecords.forEach((r, idx) => {
            const local = localRows[idx];
            if (local && local._dirty) return;
            toUpsert.push(toSyncedInspection(r, now));
          });
          if (toUpsert.length) await db.inspections.bulkPut(toUpsert);
          appliedCount = toUpsert.length;
          break;
        }
      }

      totalDownloaded += appliedCount;
      await setLastSync(tableName, now);
    }

    _metrics.downloadedRows += totalDownloaded;
    if (totalDownloaded > 0 && typeof window !== 'undefined')
      window.dispatchEvent(new Event('gv-sync-complete'));
    return { success: true, downloaded: totalDownloaded };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, downloaded: 0, error };
  }
}

// ─── Sync Queue Processing ────────────────────────────────────────────────────

export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  const supabase = createClient();
  const db = getDB();

  let synced = 0;
  let failed = 0;

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { synced: 0, failed: 0 };

    const pendingItems = await db.sync_queue
        .where('status')
        .anyOf(['pending', 'failed'])
        .and((item: import('@/lib/db').DBSyncQueueItem) => item.retry_count < 5)
        .toArray();

    _metrics.pendingQueueSize = pendingItems.length;

    for (const item of pendingItems) {
      await db.sync_queue.update(item.id!, { status: 'processing' });

      try {
        const result = await processSyncItem(supabase, item, user.id);
        if (result.success) {
          await db.sync_queue.update(item.id!, { status: 'done' });
          synced++;
          _metrics.uploadedRows++;
          trackRequest();
        } else {
          // FIX: si el error es un conflicto, no reintentar indefinidamente
          const isConflict =
              result.error?.toLowerCase().includes('conflict') ||
              result.error?.toLowerCase().includes('conflicto');

          await db.sync_queue.update(item.id!, {
            status: (item.retry_count >= 4 || isConflict) ? 'failed' : 'pending',
            retry_count: item.retry_count + 1,
            last_error: result.error,
          });
          failed++;
          _metrics.failedRows++;
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Unknown';
        await db.sync_queue.update(item.id!, {
          status: 'failed',
          retry_count: item.retry_count + 1,
          last_error: error,
        });
        failed++;
      }
    }

    const cutoff = Date.now() - 86400000;
    await db.sync_queue
        .where('status')
        .equals('done')
        .and((item: import('@/lib/db').DBSyncQueueItem) => item.created_at < cutoff)
        .delete();
  } catch (err) {
    console.error('[SyncService] Queue processing error:', err);
  }

  return { synced, failed };
}

// ─── Sanitize payload ─────────────────────────────────────────────────────────

const LOCAL_ONLY_FIELDS = [
  '_dirty',
  '_synced_at',
  'base_version',
  '_conflict',
  '_previous',
  '_base_version',
  'sync_status',
];

function sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...data };

  LOCAL_ONLY_FIELDS.forEach((key) => delete cleaned[key]);

  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

// ─── Conflict marking ─────────────────────────────────────────────────────────

async function markInspectionConflict(
    recordId: string,
    remote: Record<string, unknown>,
    local: Record<string, unknown>
): Promise<void> {
  const db = getDB();
  await db.inspections.update(recordId, {
    sync_status: 'conflict',
    _conflict: {
      remote,
      local,
      detected_at: new Date().toISOString(),
    },
  } as Partial<DBInspection>);
}

// ─── Status transitions ───────────────────────────────────────────────────────

type InspectionTransition = {
  rpcName: string;
  rpcArgs: Record<string, unknown>;
};

function getInspectionTransition(
    currentStatus: unknown,
    requestedStatus: unknown,
    payload: Record<string, unknown>,
    inspectionId: string
): InspectionTransition | null | { error: string } {
  if (typeof requestedStatus !== 'string' || requestedStatus === currentStatus) return null;

  switch (requestedStatus) {
    case 'pendiente_revision':
      return { rpcName: 'submit_for_review', rpcArgs: { p_inspection_id: inspectionId } };
    case 'aprobado':
      return { rpcName: 'approve_inspection', rpcArgs: { p_inspection_id: inspectionId } };
    case 'rechazado': {
      const reason = payload.rejection_reason;
      return typeof reason === 'string' && reason.trim().length > 0
          ? { rpcName: 'reject_inspection', rpcArgs: { p_inspection_id: inspectionId, p_reason: reason } }
          : { error: 'La transición a rechazado requiere rejection_reason.' };
    }
    case 'finalizado':
      return { rpcName: 'finalize_inspection', rpcArgs: { p_inspection_id: inspectionId } };
    case 'archivado':
      return { rpcName: 'archive_inspection', rpcArgs: { p_inspection_id: inspectionId } };
    case 'activo': {
      const reason = payload.unlock_reason;
      return typeof reason === 'string' && reason.trim().length > 0
          ? { rpcName: 'admin_unlock_inspection', rpcArgs: { p_inspection_id: inspectionId, p_reason: reason } }
          : { error: 'La transición a activo requiere unlock_reason.' };
    }
    default:
      return { error: `Transición de estado no soportada: ${requestedStatus}` };
  }
}

// ─── Process inspection update ────────────────────────────────────────────────

async function processInspectionUpdate(
    supabase: ReturnType<typeof createClient>,
    payload: Record<string, unknown>,
    recordId: string
): Promise<{ success: boolean; error?: string }> {
  const db = getDB();

  const { _previous, _base_version, ...changedFields } = payload as {
    _previous?: Record<string, unknown>;
    _base_version?: number;
    [key: string]: unknown;
  };
  const previous = _previous ?? {};
  const baseVersion = typeof _base_version === 'number' ? _base_version : 1;

  const requestedStatus = changedFields.status;
  delete changedFields.status;

  const changedKeys = Object.keys(changedFields).filter(
      (k) => k !== 'updated_at' && k !== 'version' && INSPECTION_TOP_LEVEL_COLUMNS.has(k)
  );

  // FIX: deduplicar y filtrar vacíos antes del join para evitar 406 por coma colgante
  const selectCols = ['version', 'status', ...changedKeys]
      .filter((v) => v && v.trim().length > 0)
      .filter((v, i, arr) => arr.indexOf(v) === i);

  trackRequest();
  const { data: remoteRow, error: fetchError } = await supabase
      .from('inspections')
      .select(selectCols.join(','))
      .eq('id', recordId)
      .maybeSingle();

  if (fetchError || !remoteRow) {
    return { success: false, error: fetchError?.message ?? 'Registro remoto no encontrado' };
  }

  const remote = remoteRow as Record<string, unknown>;
  const remoteVersion = remote.version as number;

  if (remoteVersion !== baseVersion) {
    const realClash = changedKeys.some((k) => {
      const remoteVal = remote[k];
      const previousVal = previous[k];
      return JSON.stringify(remoteVal) !== JSON.stringify(previousVal);
    });

    if (realClash) {
      await markInspectionConflict(recordId, remote, changedFields);
      return { success: true };
    }
  }

  const transition = getInspectionTransition(remote.status, requestedStatus, payload, recordId);
  if (transition && 'error' in transition) return { success: false, error: transition.error };

  if (transition) {
    trackRequest();
    const { error: transitionError } = await supabase.rpc(transition.rpcName, transition.rpcArgs);
    if (transitionError) return { success: false, error: transitionError.message };
  }

  const cleanPayload = sanitizePayload(
      Object.fromEntries(
          Object.entries(changedFields).filter(([k]) => INSPECTION_TOP_LEVEL_COLUMNS.has(k))
      )
  );
  delete cleanPayload.version;

  if (Object.keys(cleanPayload).filter((key) => key !== 'updated_at').length === 0) {
    trackRequest();
    const { data: refreshed, error: refreshError } = await supabase
        .from('inspections')
        .select('version')
        .eq('id', recordId)
        .maybeSingle();
    if (refreshError) return { success: false, error: refreshError.message };

    if (typeof refreshed?.version !== 'number') {
      return { success: false, error: 'No fue posible leer la versión actualizada de la inspección.' };
    }

    await db.inspections.update(recordId, {
      status: typeof requestedStatus === 'string' ? requestedStatus : undefined,
      version: refreshed.version,
      base_version: refreshed.version,
      sync_status: 'synced',
      _dirty: false,
    } as Partial<DBInspection>);
    return { success: true };
  }

  trackRequest();
  const { data: updatedRow, error: updateError } = await supabase
      .from('inspections')
      .update({ ...cleanPayload, updated_at: new Date().toISOString() })
      .eq('id', recordId)
      .eq('version', remoteVersion)
      .select('version')
      .maybeSingle();

  if (updateError) return { success: false, error: updateError.message };

  if (!updatedRow) {
    await markInspectionConflict(recordId, remote, changedFields);
    return { success: true };
  }

  if (typeof updatedRow.version !== 'number') {
    return { success: false, error: 'El trigger de Postgres no retornó la nueva versión.' };
  }

  await db.inspections.update(recordId, {
    ...(typeof requestedStatus === 'string' ? { status: requestedStatus } : {}),
    version: updatedRow.version,
    base_version: updatedRow.version,
    sync_status: 'synced',
    _dirty: false,
  } as Partial<DBInspection>);

  return { success: true };
}

// ─── Process individual sync item ─────────────────────────────────────────────

async function processSyncItem(
    supabase: ReturnType<typeof createClient>,
    item: DBSyncQueueItem,
    userId: string
): Promise<{ success: boolean; error?: string }> {
  const { table_name, operation, payload, record_id } = item;

  try {
    if (operation === 'RPC') {
      const rpcName = payload.rpc_name as string;
      const rpcArgs = (payload.rpc_args as Record<string, unknown>) ?? {};
      trackRequest();
      const { error } = await supabase.rpc(rpcName, rpcArgs);
      if (error) {
        console.warn(`[SyncService] RPC ${rpcName} failed for ${record_id}:`, error.message);
        await markInspectionConflict(record_id, { rpc_error: error.message }, payload);
        return { success: false, error: `RPC conflict: ${error.message}` };
      }

      trackRequest();
      const { data: refreshed, error: refreshError } = await supabase
          .from('inspections')
          .select('*')
          .eq('id', record_id)
          .maybeSingle();
      if (refreshError || !refreshed) {
        return {
          success: false,
          error: refreshError?.message ?? 'No fue posible refrescar la inspección transicionada',
        };
      }
      const db = getDB();
      const remote = refreshed as unknown as DBInspection;
      await db.inspections.put({
        ...remote,
        _synced_at: Date.now(),
        _dirty: false,
        sync_status: 'synced',
        base_version: remote.version ?? 1,
      });
      return { success: true };
    }

    if (table_name === 'inspections' && operation === 'UPDATE') {
      return await processInspectionUpdate(supabase, payload as Record<string, unknown>, record_id);
    }

    const cleanPayload = sanitizePayload(payload as Record<string, unknown>);

    if (operation === 'INSERT') {
      const { error } = await supabase
          .from(table_name)
          .upsert({ ...cleanPayload, id: record_id }, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };
    } else if (operation === 'UPDATE') {
      const { error } = await supabase
          .from(table_name)
          .update({ ...cleanPayload, updated_at: new Date().toISOString() })
          .eq('id', record_id);
      if (error) return { success: false, error: error.message };
    } else if (operation === 'DELETE') {
      const { error } = await supabase.from(table_name).delete().eq('id', record_id);
      if (error) return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown' };
  }
}

// ─── Enqueue Operations ───────────────────────────────────────────────────────

export async function enqueueOperation(
    tableName: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RPC',
    recordId: string,
    payload: Record<string, unknown>
): Promise<void> {
  const db = getDB();

  // Solo se fusiona para UPDATE: INSERT/DELETE/RPC deben quedar como eventos
  // discretos. Si ya hay un UPDATE pendiente o fallido para el mismo registro,
  // se combina en vez de encolar uno nuevo — así una inspección con varios
  // guardados por módulo genera un solo PATCH al sincronizar, con un
  // _base_version consistente (el del primer guardado pendiente).
  if (operation === 'UPDATE') {
    const existing = await db.sync_queue
        .where('status')
        .anyOf(['pending', 'failed'])
        .and(
            (item: import('@/lib/db').DBSyncQueueItem) =>
                item.table_name === tableName && item.record_id === recordId && item.retry_count < 5
        )
        .first();

    if (existing) {
      const existingPayload = existing.payload as Record<string, unknown>;

      // Los campos nuevos ganan (son los más recientes), pero _previous y
      // _base_version se conservan del ítem original: representan el estado
      // remoto conocido ANTES de que empezara esta racha de ediciones locales,
      // que es lo que syncService necesita para comparar contra el remoto real.
      const mergedPayload: Record<string, unknown> = {
        ...existingPayload,
        ...payload,
        _previous: {
          ...(existingPayload._previous as Record<string, unknown> | undefined),
          ...(payload._previous as Record<string, unknown> | undefined),
        },
        _base_version: existingPayload._base_version ?? payload._base_version,
      };

      await db.sync_queue.update(existing.id!, {
        payload: mergedPayload,
        created_at: Date.now(),
        // Si el ítem venía 'failed', esto es una edición nueva del usuario,
        // no un reintento del mismo fallo: se resetea el estado y el
        // historial de reintentos/errores para no arrastrar info obsoleta.
        status: 'pending',
        retry_count: 0,
        last_error: undefined,
      });
      return;
    }
  }

  await db.sync_queue.add({
    table_name: tableName,
    operation,
    payload,
    record_id: recordId,
    created_at: Date.now(),
    retry_count: 0,
    status: 'pending',
  });
}

// ─── Queue Stats ──────────────────────────────────────────────────────────────

export async function getPendingQueueCount(): Promise<number> {
  const db = getDB();
  await db.sync_queue.where('status').equals('done').delete();
  return db.sync_queue
      .where('status')
      .anyOf(['pending', 'failed'])
      .and((item: import('@/lib/db').DBSyncQueueItem) => item.retry_count < 5)
      .count();
}

export async function clearDoneQueueItems(): Promise<void> {
  const db = getDB();
  await db.sync_queue.where('status').equals('done').delete();
}