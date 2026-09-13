import Dexie, { type Table } from 'dexie';

// ─── Table Interfaces ─────────────────────────────────────────────────────────

export interface DBProfile {
  id: string;
  email: string;
  role: 'admin' | 'inspector' | 'comercial';
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
  _dirty?: boolean;
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
  finalization_timestamp?: string;
  creation_timestamp?: string;
  local_id?: string;
  sync_status?: 'pending' | 'synced' | 'failed';
  created_at: string;
  updated_at: string;
  _synced_at?: number;
  _dirty?: boolean;
}

export interface DBSyncQueueItem {
  id?: number;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  record_id: string;
  created_at: number;
  retry_count: number;
  last_error?: string;
  status: 'pending' | 'processing' | 'failed' | 'done';
}

export interface DBSyncMeta {
  id: string;
  last_sync: number;
}

// ─── Production Orders Interfaces ─────────────────────────────────────────────

export interface DBProductionOrderItem {
  id: string;
  order_id: string;
  linea: number;
  pieza_id: string;
  pieza_nombre: string;
  codigo: string;
  cantidad: number;
  nivel_nij_id: string;
  nivel_nij_nombre: string;
  lleva_marcacion: boolean;
  tipo_marcacion_id?: string;
  tipo_marcacion_nombre?: string;
  observaciones?: string;
  created_at: string;
  updated_at: string;
}

export interface DBProductionOrder {
  id: string;
  numero_orden?: string;
  fecha: string;
  cliente_id: string;
  cliente_nombre: string;
  pais: string;
  modelo_id: string;
  modelo_nombre: string;
  nivel_nij_id: string;
  nivel_nij_nombre: string;
  forma_pago_id: string;
  forma_pago_nombre: string;
  incoterm_id: string;
  incoterm_nombre: string;
  cantidad_vehiculos: number;
  observaciones?: string;
  status: string;
  total_piezas: number;
  rejection_reason?: string;
  submitted_at?: string;
  submitted_by?: string;
  approved_at?: string;
  approved_by?: string;
  rejected_at?: string;
  rejected_by?: string;
  cancelled_at?: string;
  cancelled_by?: string;
  version: number;
  created_by?: string;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
  items?: DBProductionOrderItem[];
  _synced_at?: number;
  _dirty?: boolean;
}

// ─── Catalog Interfaces ───────────────────────────────────────────────────────

export interface DBPOCatalogItem {
  id: string;
  nombre: string;
  activo: boolean;
  orden?: number;
  created_at: string;
  updated_at: string;
  _synced_at?: number;
}

export interface DBPOCliente extends DBPOCatalogItem {
  pais?: string;
}

export interface DBPOPiezaVidrio extends DBPOCatalogItem {
  codigo: string;
  abreviatura: string;
}

// ─── Dexie Database ───────────────────────────────────────────────────────────

class GVDatabase extends Dexie {
  profiles!: Table<DBProfile, string>;
  vehicles!: Table<DBVehicle, string>;
  materials!: Table<DBMaterial, string>;
  inspections!: Table<DBInspection, string>;
  sync_queue!: Table<DBSyncQueueItem, number>;
  sync_meta!: Table<DBSyncMeta, string>;
  production_orders!: Table<DBProductionOrder, string>;
  po_clientes!: Table<DBPOCliente, string>;
  po_modelos_vehiculo!: Table<DBPOCatalogItem, string>;
  po_niveles_nij!: Table<DBPOCatalogItem, string>;
  po_formas_pago!: Table<DBPOCatalogItem, string>;
  po_incoterms!: Table<DBPOCatalogItem, string>;
  po_piezas_vidrio!: Table<DBPOPiezaVidrio, string>;
  po_tipos_marcacion!: Table<DBPOCatalogItem, string>;

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

    // Version 2 and 3 — keep unchanged (no-op upgrades preserve data)
    this.version(2).stores({
      profiles: 'id, email, role, is_active, updated_at',
      vehicles: 'id, placa, marca, propietario, created_by, updated_at, _dirty',
      materials: 'id, nombre, categoria, updated_at, _dirty',
      inspections: 'id, placa, inspector_id, status, updated_at, local_id, _dirty',
      sync_queue: '++id, table_name, operation, record_id, status, created_at',
      sync_meta: 'id',
    });

    this.version(3).stores({
      profiles: 'id, email, role, is_active, updated_at',
      vehicles: 'id, placa, marca, propietario, created_by, updated_at, _dirty',
      materials: 'id, nombre, categoria, updated_at, _dirty',
      inspections: 'id, placa, inspector_id, status, updated_at, local_id, _dirty',
      sync_queue: '++id, table_name, operation, record_id, status, created_at',
      sync_meta: 'id',
    });

    // Version 4 — adds production orders and catalog tables
    this.version(4).stores({
      profiles: 'id, email, role, is_active, updated_at',
      vehicles: 'id, placa, marca, propietario, created_by, updated_at, _dirty',
      materials: 'id, nombre, categoria, updated_at, _dirty',
      inspections: 'id, placa, inspector_id, status, updated_at, local_id, _dirty',
      sync_queue: '++id, table_name, operation, record_id, status, created_at',
      sync_meta: 'id',
      production_orders: 'id, numero_orden, status, cliente_id, modelo_id, created_by, updated_at, _dirty',
      po_clientes: 'id, nombre, activo, updated_at',
      po_modelos_vehiculo: 'id, nombre, activo, updated_at',
      po_niveles_nij: 'id, nombre, activo, updated_at',
      po_formas_pago: 'id, nombre, activo, updated_at',
      po_incoterms: 'id, nombre, activo, updated_at',
      po_piezas_vidrio: 'id, nombre, codigo, activo, updated_at',
      po_tipos_marcacion: 'id, nombre, activo, updated_at',
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
