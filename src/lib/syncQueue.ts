import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QueueItemType = 'vehicle' | 'inspection';
export type QueueItemStatus = 'pending' | 'syncing' | 'failed';

export interface QueueItem {
  id: string;
  type: QueueItemType;
  action: 'create' | 'update' | 'finalize' | 'unlock';
  payload: Record<string, unknown>;
  localId: string;
  remoteId?: string;
  status: QueueItemStatus;
  retries: number;
  createdAt: number;
  lastAttempt?: number;
  errorMessage?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const QUEUE_KEY = 'gv_sync_queue';
const MAX_RETRIES = 5;

// ─── Queue Storage Helpers ────────────────────────────────────────────────────

function readQueue(): QueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(items: QueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // storage full — silently ignore
  }
}

function markInspectionSynced(localId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem('gv_inspections');
    if (!raw) return;
    const inspections = JSON.parse(raw) as Array<Record<string, unknown>>;
    const updated = inspections.map((inspection) =>
      inspection.id === localId
        ? { ...inspection, syncStatus: 'synced', lastSyncedAt: Date.now() }
        : inspection
    );
    localStorage.setItem('gv_inspections', JSON.stringify(updated));
  } catch {
    // A completed remote sync must not fail because UI bookkeeping failed.
  }
}

function generateQueueId(): string {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ─── Public Queue API ─────────────────────────────────────────────────────────

/** Add a new item to the sync queue — deduplicates by localId+action */
export function enqueue(
  type: QueueItemType,
  action: 'create' | 'update' | 'finalize' | 'unlock',
  payload: Record<string, unknown>,
  localId: string,
  remoteId?: string
): QueueItem {
  const queue = readQueue();

  // Deduplication: if same localId+action already pending, update payload instead of adding duplicate
  const existingIdx = queue.findIndex(
    (i) => i.localId === localId && i.action === action && i.status !== 'failed'
  );
  if (existingIdx !== -1) {
    queue[existingIdx] = {
      ...queue[existingIdx],
      payload,
      createdAt: Date.now(),
      status: 'pending',
      retries: 0,
    };
    writeQueue(queue);
    return queue[existingIdx];
  }

  const item: QueueItem = {
    id: generateQueueId(),
    type,
    action,
    payload,
    localId,
    remoteId,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
  };
  writeQueue([...queue, item]);
  return item;
}

/** Get all pending items */
export function getPendingItems(): QueueItem[] {
  return readQueue().filter((i) => i.status === 'pending' || i.status === 'failed');
}

/** Get total count of items waiting to sync */
export function getPendingCount(): number {
  return getPendingItems().length;
}

/** Remove a successfully synced item */
export function removeFromQueue(id: string): void {
  writeQueue(readQueue().filter((i) => i.id !== id));
}

/** Update an item's status in the queue */
export function updateQueueItem(id: string, updates: Partial<QueueItem>): void {
  const queue = readQueue().map((i) => (i.id === id ? { ...i, ...updates } : i));
  writeQueue(queue);
}

/** Clear all successfully synced items */
export function clearSyncedItems(): void {
  writeQueue(readQueue().filter((i) => i.status !== 'pending'));
}

// ─── Supabase Sync Logic ──────────────────────────────────────────────────────

/** Map a vehicle payload to Supabase columns */
function vehicleToSupabase(payload: Record<string, unknown>) {
  return {
    marca: payload.marca,
    modelo: payload.modelo,
    color: payload.color,
    placa: payload.placa,
    vin: payload.vin,
    propietario: payload.propietario ?? payload.owner,
    fecha_creacion: payload.fechaCreacion,
    materials: payload.materials ?? [],
    local_id: payload.id ?? payload.localId,
    created_by: payload.createdBy ?? null,
    last_synced_at: new Date().toISOString(),
  };
}

/** Map an inspection payload to Supabase columns */
function inspectionToSupabase(payload: Record<string, unknown>, inspectorId: string) {
  return {
    placa: payload.placa,
    marca: payload.marca,
    modelo: payload.modelo,
    color: payload.color,
    propietario: payload.propietario,
    fecha: payload.fecha,
    status: payload.status,
    secciones_completadas: payload.seccionesCompletadas,
    total_secciones: payload.totalSecciones,
    data: payload.datos ?? payload.data,
    local_id: payload.id ?? payload.localId,
    is_locked: payload.isLocked ?? false,
    finalized_at: payload.finalizedAt ? new Date(payload.finalizedAt as number).toISOString() : null,
    finalized_by: payload.finalizedBy ?? null,
    finalization_timestamp: payload.finalizationTimestamp ?? null,
    creation_timestamp: payload.creationTimestamp ?? new Date().toISOString(),
    inspector_name: payload.inspectorName ?? null,
    // SECURITY: Always stamp the authenticated user as inspector_id on sync
    inspector_id: inspectorId,
    sync_status: 'synced',
    last_synced_at: new Date().toISOString(),
  };
}

/** Attempt to sync a single queue item to Supabase */
async function syncItem(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  // SECURITY: Verify the user is still authenticated before syncing
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'Not authenticated — sync aborted' };
  }

  const table = item.type === 'vehicle' ? 'vehicles' : 'inspections';

  const data =
    item.type === 'vehicle'
      ? vehicleToSupabase(item.payload)
      : inspectionToSupabase(item.payload, user.id);

  try {
    if (item.action === 'create') {
      // For vehicles: try upsert on placa (unique), fallback to insert
      if (item.type === 'vehicle') {
        const vehicleData = data as ReturnType<typeof vehicleToSupabase>;
        // Remove local_id from insert since it may not exist in DB
        const { local_id: _localId, last_synced_at: _ls, ...insertData } = vehicleData;
        const { error } = await supabase.from(table).upsert(
          { ...insertData, created_by: user.id },
          { onConflict: 'placa', ignoreDuplicates: false }
        );
        if (error) return { success: false, error: error.message };
      } else {
        // Inspections: upsert on local_id if column exists, else insert
        const { error } = await supabase.from(table).upsert(data, { onConflict: 'local_id' });
        if (error) {
          // Fallback: plain insert if local_id column doesn't exist
          const { local_id: _lid, last_synced_at: _ls, ...plainData } = data as Record<string, unknown>;
          const { error: insertError } = await supabase.from(table).insert(plainData);
          if (insertError) return { success: false, error: insertError.message };
        }
      }
    } else if (item.action === 'finalize' || item.action === 'unlock') {
      // Finalize/unlock: update by remote id or placa
      const matchCol = item.remoteId || (item.type === 'inspection' && isUuid(item.localId))
        ? 'id'
        : (item.type === 'vehicle' ? 'placa' : 'local_id');
      const matchVal = item.remoteId ?? (item.type === 'vehicle' ? item.payload.placa as string : item.localId);
      const { error } = await supabase.from(table).update(data).eq(matchCol, matchVal);
      if (error) return { success: false, error: error.message };

      // Write audit log entry for inspections
      if (item.type === 'inspection') {
        const action = item.action === 'finalize' ? 'finalized' : 'unlocked';
        await supabase.from('inspection_audit_log').insert({
          inspection_id: item.remoteId ?? null,
          action,
          performed_by: user.id,
          details: { local_id: item.localId, timestamp: new Date().toISOString() },
        }).then(() => {}); // non-fatal
      }
    } else {
      // update — match by remote id or placa/local_id
      const matchCol = item.remoteId || (item.type === 'inspection' && isUuid(item.localId))
        ? 'id'
        : (item.type === 'vehicle' ? 'placa' : 'local_id');
      const matchVal = item.remoteId ?? (item.type === 'vehicle' ? item.payload.placa as string : item.localId);

      if (item.type === 'inspection') {
        // Conflict detection: only update if our local version is newer
        const { data: existing, error: conflictError } = await supabase
          .from(table)
          .select('updated_at, is_locked')
          .eq(matchCol, matchVal)
          .maybeSingle();

        if (conflictError) {
          console.error('Inspection query failed', {
            message: conflictError.message,
            details: conflictError.details,
            hint: conflictError.hint,
            code: conflictError.code,
          });
        }

        if (existing?.updated_at) {
          const serverTs = new Date(existing.updated_at).getTime();
          const localTs = item.createdAt;
          if (serverTs > localTs) {
            return { success: true };
          }
        }

        if (existing?.is_locked && (item.action as string) !== 'unlock') {
          return { success: true };
        }
      }

      const { error } = await supabase.from(table).update(data).eq(matchCol, matchVal);
      if (error) return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// ─── Sync Runner ──────────────────────────────────────────────────────────────

let isSyncing = false;

/** Process all pending queue items. Returns counts of synced/failed. */
export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { synced: 0, failed: 0 };

  isSyncing = true;
  let synced = 0;
  let failed = 0;
  let syncedInspection = false;

  const pending = getPendingItems().filter((i) => i.retries < MAX_RETRIES);

  for (const item of pending) {
    // Mark as syncing
    updateQueueItem(item.id, { status: 'syncing', lastAttempt: Date.now() });

    const result = await syncItem(item);

    if (result.success) {
      removeFromQueue(item.id);
      if (item.type === 'inspection') {
        markInspectionSynced(item.localId);
        syncedInspection = true;
      }
      synced++;
    } else {
      const newRetries = item.retries + 1;
      updateQueueItem(item.id, {
        status: newRetries >= MAX_RETRIES ? 'failed' : 'pending',
        retries: newRetries,
        errorMessage: result.error,
      });
      failed++;
    }
  }

  isSyncing = false;
  if (syncedInspection && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('gv-sync-complete'));
  }
  return { synced, failed };
}
