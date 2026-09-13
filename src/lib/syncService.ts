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

let _metrics: SyncMetrics = {
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

// ─── Initial Data Download (on login) ────────────────────────────────────────

/**
 * Downloads all main tables from Supabase and stores in IndexedDB.
 * Called once on login. Subsequent syncs use incremental strategy.
 */
export async function initialDataDownload(): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();
  const db = getDB();

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const syncStart = Date.now();
    _metrics.startTime = syncStart;
    _metrics.supabaseRequests = 0;
    _metrics.downloadedRows = 0;

    // Download all 4 main tables in parallel
    trackRequest();
    const [profilesRes, vehiclesRes, materialsRes, inspectionsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('updated_at', { ascending: false }),
      supabase.from('vehicles').select('*').order('updated_at', { ascending: false }),
      supabase.from('materials').select('*').order('updated_at', { ascending: false }),
      supabase.from('inspections').select('*').order('updated_at', { ascending: false }),
    ]);
    _metrics.supabaseRequests += 3; // 4 total (counted 1 above)

    const now = Date.now();

    // Store profiles
    if (profilesRes.data && !profilesRes.error) {
      const profiles = (profilesRes.data as Record<string, unknown>[]).map((p) => ({
        ...p,
        _synced_at: now,
      })) as DBProfile[];
      await db.profiles.bulkPut(profiles);
      _metrics.downloadedRows += profiles.length;
      await setLastSync('profiles', now);
    }

    // Store vehicles
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

    // Store materials
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

    // Store inspections
    if (inspectionsRes.data && !inspectionsRes.error) {
      const inspections = (inspectionsRes.data as Record<string, unknown>[]).map((i) => ({
        ...i,
        _synced_at: now,
        _dirty: false,
      })) as DBInspection[];
      await db.inspections.bulkPut(inspections);
      _metrics.downloadedRows += inspections.length;
      await setLastSync('inspections', now);
    }

    _metrics.endTime = Date.now();
    _metrics.lastSyncDuration = _metrics.endTime - syncStart;

    console.log(`[SyncService] Initial download complete: ${_metrics.downloadedRows} rows in ${_metrics.lastSyncDuration}ms`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SyncService] Initial download failed:', error);
    return { success: false, error };
  }
}

// ─── Incremental Sync (smart delta sync) ─────────────────────────────────────

/**
 * Downloads only records modified since last sync.
 * Uses updated_at timestamp comparison.
 */
export async function incrementalSync(tables?: string[]): Promise<{ success: boolean; downloaded: number; error?: string }> {
  const supabase = createClient();
  const db = getDB();
  const targetTables = tables ?? ['profiles', 'vehicles', 'materials', 'inspections'];

  try {
    const { data: { user } } = await supabase.auth.getUser();
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

      // Upsert into IndexedDB
      const records = (data as Record<string, unknown>[]).map((r) => ({ ...r, _synced_at: now, _dirty: false }));

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
        case 'inspections':
          await db.inspections.bulkPut(records as unknown as DBInspection[]);
          break;
      }

      totalDownloaded += records.length;
      await setLastSync(tableName, now);
    }

    _metrics.downloadedRows += totalDownloaded;
    console.log(`[SyncService] Incremental sync: ${totalDownloaded} rows updated`);
    return { success: true, downloaded: totalDownloaded };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, downloaded: 0, error };
  }
}

// ─── Sync Queue Processing ────────────────────────────────────────────────────

/**
 * Processes all pending items in the sync_queue.
 * Uploads local changes to Supabase.
 */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  const supabase = createClient();
  const db = getDB();

  let synced = 0;
  let failed = 0;

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { synced: 0, failed: 0 };

    const pendingItems = await db.sync_queue
        .where('status')
        .anyOf(['pending', 'failed'])
        .and((item) => item.retry_count < 5)
        .toArray();

    _metrics.pendingQueueSize = pendingItems.length;

    for (const item of pendingItems) {
      // Mark as processing
      await db.sync_queue.update(item.id!, { status: 'processing' });

      try {
        const result = await processSyncItem(supabase, item, user.id);
        if (result.success) {
          await db.sync_queue.update(item.id!, { status: 'done' });
          synced++;
          _metrics.uploadedRows++;
          trackRequest();
        } else {
          await db.sync_queue.update(item.id!, {
            status: item.retry_count >= 4 ? 'failed' : 'pending',
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

    // Clean up done items older than 24h
    const cutoff = Date.now() - 86400000;
    await db.sync_queue
        .where('status')
        .equals('done')
        .and((item) => item.created_at < cutoff)
        .delete();

  } catch (err) {
    console.error('[SyncService] Queue processing error:', err);
  }

  return { synced, failed };
}

/**
 * Removes local-only bookkeeping fields (and undefined values) from a payload
 * before it is sent to Supabase. IndexedDB records carry fields like
 * `_dirty` and `_synced_at` that do not exist in the Postgres schema; sending
 * them causes a 400 Bad Request on insert/update.
 */
function sanitizePayload(data: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...data };

  delete cleaned._dirty;
  delete cleaned._synced_at;

  Object.keys(cleaned).forEach((key) => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

async function processSyncItem(
    supabase: ReturnType<typeof createClient>,
    item: DBSyncQueueItem,
    userId: string
): Promise<{ success: boolean; error?: string }> {
  const { table_name, operation, payload, record_id } = item;

  try {
    const cleanPayload = sanitizePayload(payload as Record<string, unknown>);

    if (operation === 'INSERT') {
      const { error } = await supabase
          .from(table_name)
          .upsert({ ...cleanPayload, id: record_id }, { onConflict: 'id' });
      if (error) return { success: false, error: error.message };

      // For production_orders: read back server-assigned numero_orden and status
      if (table_name === 'production_orders') {
        const { data: serverRow } = await supabase
            .from('production_orders')
            .select('id, numero_orden, status, updated_at')
            .eq('id', record_id)
            .single();
        if (serverRow) {
          const db = getDB();
          await db.table('production_orders').update(record_id, {
            numero_orden: serverRow.numero_orden,
            status: serverRow.status,
            updated_at: serverRow.updated_at,
            _dirty: false,
            _synced_at: Date.now(),
          });
        }
      }
    } else if (operation === 'UPDATE') {
      const { error } = await supabase
          .from(table_name)
          .update({ ...cleanPayload, updated_at: new Date().toISOString() })
          .eq('id', record_id);
      if (error) return { success: false, error: error.message };

      // For production_orders: read back server-authoritative status and numero_orden
      if (table_name === 'production_orders') {
        const { data: serverRow } = await supabase
            .from('production_orders')
            .select('id, numero_orden, status, updated_at')
            .eq('id', record_id)
            .single();
        if (serverRow) {
          const db = getDB();
          await db.table('production_orders').update(record_id, {
            numero_orden: serverRow.numero_orden,
            status: serverRow.status,
            updated_at: serverRow.updated_at,
            _dirty: false,
            _synced_at: Date.now(),
          });
        }
      }
    } else if (operation === 'DELETE') {
      const { error } = await supabase
          .from(table_name)
          .delete()
          .eq('id', record_id);
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
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    recordId: string,
    payload: Record<string, unknown>
): Promise<void> {
  const db = getDB();
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
  return db.sync_queue.where('status').anyOf(['pending', 'failed']).count();
}

export async function clearDoneQueueItems(): Promise<void> {
  const db = getDB();
  await db.sync_queue.where('status').equals('done').delete();
}