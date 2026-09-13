import Dexie, { type Table } from 'dexie';

// ─── Table Interfaces ─────────────────────────────────────────────────────────

export interface DBProfile {
  id: string;
  email: string;
  role: 'admin' | 'inspector';
  full_name: string;
  is_active: boolean;
  must_reset_password: boolean;
  created_at: string;
  updated_at: string;
  _synced_at?: number;
}

export interface DBVehicle {
  id: string;
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  vin?: string;
  propietario: string;
  fecha_creacion?: string;
  materials?: unknown[];
  created_by?: string;
  created_at: string;
  updated_at: string;
  local_id?: string;
  _synced_at?: number;
  _dirty?: boolean; // true = has local changes not yet synced
}

export interface DBMaterial {
  id: string;
  nombre: string;
  categoria: string;
  unidad: string;
  stock: number;
  stock_minimo: number;
  descripcion?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  _synced_at?: number;
  _dirty?: boolean;
}

export interface DBInspection {
  id: string;
  enterprise_id?: string;
  placa: string;
  marca: string;
  modelo: string;
  color: string;
  propietario: string;
  fecha: string;
  status: string;
  secciones_completadas: number;
  total_secciones: number;
  data: Record<string, unknown>;
  inspector_id?: string;
  inspector_name?: string;
  is_locked?: boolean;
  finalized_at?: string;
  finalized_by?: string;
  unlocked_at?: string;
  unlocked_by?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  rejection_reason?: string;
  unlock_reason?: string;
  finalized_snapshot?: Record<string, unknown>;
  finalization_timestamp?: string;
  creation_timestamp?: string;
  local_id?: string;
  sync_status?: 'pending' | 'synced' | 'failed' | 'conflict';
  // Concurrencia optimista: version incrementada por trigger en Supabase en cada UPDATE.
  version: number;
  // Última version remota conocida al momento del último sync exitoso.
  // Se compara contra la version actual del servidor antes de un UPDATE
  // para detectar si alguien más modificó el registro mientras estábamos offline.
  base_version?: number;
  // Presente solo si sync_status === 'conflict'. Guarda ambas versiones
  // para que la UI decida (o para auto-merge si los campos no chocan).
  _conflict?: {
    remote: Partial<DBInspection>;
    local: Partial<DBInspection>;
    detected_at: string;
  };
  created_at: string;
  updated_at: string;
  _synced_at?: number;
  _dirty?: boolean;
}

export interface DBSyncQueueItem {
  id?: number; // auto-increment
  table_name: string;
  // 'RPC' se usa para transiciones de estado encoladas mientras se está offline
  // (submit_for_review, approve_inspection, etc). Para estos items, payload
  // tiene la forma { rpc_name: string, rpc_args: Record<string, unknown> } y
  // syncService.ts debe llamar supabase.rpc(payload.rpc_name, payload.rpc_args)
  // en vez de hacer upsert.
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RPC';
  payload: Record<string, unknown>;
  record_id: string;
  created_at: number;
  retry_count: number;
  last_error?: string;
  status: 'pending' | 'processing' | 'failed' | 'done';
}

export interface DBErrorLog {
  id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  stack?: string | null;
  context?: string | null;
  user_id?: string | null;
  user_email?: string | null;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface DBSyncMeta {
  id: string; // table name
  last_sync: number; // unix timestamp ms
}

// ─── Dexie Database ───────────────────────────────────────────────────────────

class GVDatabase extends Dexie {
  profiles!: Table<DBProfile, string>;
  vehicles!: Table<DBVehicle, string>;
  materials!: Table<DBMaterial, string>;
  inspections!: Table<DBInspection, string>;
  sync_queue!: Table<DBSyncQueueItem, number>;
  sync_meta!: Table<DBSyncMeta, string>;
  error_logs!: Table<DBErrorLog, string>;

  constructor() {
    super('gv_enterprise_db');

    this.version(1).stores({
      profiles: 'id, email, role, is_active, updated_at',
      vehicles: 'id, placa, marca, propietario, created_by, updated_at, _dirty',
      materials: 'id, nombre, categoria, updated_at, _dirty',
      inspections: 'id, placa, inspector_id, status, updated_at, local_id, _dirty',
      sync_queue: '++id, table_name, operation, record_id, status, created_at',
      sync_meta: 'id',
    });

    this.version(2).stores({
      profiles: 'id, email, role, is_active, updated_at',
      vehicles: 'id, placa, marca, propietario, created_by, updated_at, _dirty',
      materials: 'id, nombre, categoria, updated_at, _dirty',
      inspections: 'id, placa, inspector_id, status, updated_at, local_id, _dirty',
      sync_queue: '++id, table_name, operation, record_id, status, created_at',
      sync_meta: 'id',
      error_logs: 'id, level, created_at, context',
    });

    // v3: soporte de concurrencia optimista (version) y estado de conflicto
    this.version(3)
      .stores({
        profiles: 'id, email, role, is_active, updated_at',
        vehicles: 'id, placa, marca, propietario, created_by, updated_at, _dirty',
        materials: 'id, nombre, categoria, updated_at, _dirty',
        inspections: 'id, placa, inspector_id, status, updated_at, local_id, _dirty, sync_status',
        sync_queue: '++id, table_name, operation, record_id, status, created_at',
        sync_meta: 'id',
        error_logs: 'id, level, created_at, context',
      })
      .upgrade(async (tx) => {
        // Registros existentes no tienen version todavía: asumimos 1 (recién sincronizados)
        await tx
          .table('inspections')
          .toCollection()
          .modify((insp: DBInspection) => {
            if (insp.version === undefined) insp.version = 1;
            if (insp.base_version === undefined) insp.base_version = insp.version;
          });
      });
  }
}

// Singleton instance
let _db: GVDatabase | null = null;

export function getDB(): GVDatabase {
  if (!_db) {
    _db = new GVDatabase();
  }
  return _db;
}

// ─── Sync Meta Helpers ────────────────────────────────────────────────────────

export async function getLastSync(tableName: string): Promise<number> {
  try {
    const db = getDB();
    const meta = await db.sync_meta.get(tableName);
    return meta?.last_sync ?? 0;
  } catch {
    return 0;
  }
}

export async function setLastSync(tableName: string, timestamp: number): Promise<void> {
  try {
    const db = getDB();
    await db.sync_meta.put({ id: tableName, last_sync: timestamp });
  } catch {
    // silently fail
  }
}
