import {
  getDB,
  type DBVehicle,
  type DBMaterial,
  type DBInspection,
  type DBProfile,
  type DBProductionOrder,
  type DBPOCliente,
  type DBPOCatalogItem,
  type DBPOPiezaVidrio,
} from '@/lib/db';
import { enqueueOperation } from '@/lib/syncService';

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
    return db.vehicles
      .filter(
        (v) =>
          v.placa?.toLowerCase().includes(q) ||
          v.marca?.toLowerCase().includes(q) ||
          v.propietario?.toLowerCase().includes(q)
      )
      .toArray();
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
    return db.materials
      .filter((m) => m.nombre?.toLowerCase().includes(q) || m.categoria?.toLowerCase().includes(q))
      .toArray();
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

  async search(query: string, status?: string): Promise<DBInspection[]> {
    const db = getDB();
    const q = query.toLowerCase();
    return db.inspections
      .filter((i): boolean => {
        const matchQuery =
          !q ||
          Boolean(
            i.placa?.toLowerCase().includes(q) ||
            i.propietario?.toLowerCase().includes(q) ||
            i.marca?.toLowerCase().includes(q) ||
            i.enterprise_id?.toLowerCase().includes(q) ||
            i.inspector_name?.toLowerCase().includes(q)
          );
        const matchStatus = !status || status === 'all' || i.status === status;
        return matchQuery && matchStatus;
      })
      .toArray();
  },

  async create(inspection: Omit<DBInspection, '_synced_at' | '_dirty'>): Promise<DBInspection> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBInspection = {
      ...inspection,
      created_at: inspection.created_at || now,
      updated_at: now,
      sync_status: 'pending',
      _dirty: true,
      _synced_at: undefined,
    };
    await db.inspections.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = record as unknown as Record<string, unknown>;
    await enqueueOperation('inspections', 'INSERT', record.id, cleanPayload);
    return record;
  },

  async update(id: string, changes: Partial<DBInspection>): Promise<void> {
    const db = getDB();
    const now = new Date().toISOString();
    const updated = { ...changes, updated_at: now, _dirty: true };
    await db.inspections.update(id, updated);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, ...cleanPayload } = updated as Record<string, unknown>;
    await enqueueOperation('inspections', 'UPDATE', id, cleanPayload);
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
};

// ─── Production Orders Repository ─────────────────────────────────────────────

export const ProductionOrdersRepo = {
  async getAll(): Promise<DBProductionOrder[]> {
    const db = getDB();
    return db.production_orders.orderBy('updated_at').reverse().toArray();
  },

  async getById(id: string): Promise<DBProductionOrder | undefined> {
    const db = getDB();
    return db.production_orders.get(id);
  },

  async search(query: string, status?: string): Promise<DBProductionOrder[]> {
    const db = getDB();
    const q = query.toLowerCase();
    return db.production_orders
      .filter((o): boolean => {
        const matchQuery =
          !q ||
          Boolean(
            o.numero_orden?.toLowerCase().includes(q) ||
            o.cliente_nombre?.toLowerCase().includes(q) ||
            o.modelo_nombre?.toLowerCase().includes(q) ||
            o.pais?.toLowerCase().includes(q)
          );
        const matchStatus = !status || status === 'all' || o.status === status;
        return matchQuery && matchStatus;
      })
      .toArray();
  },

  async create(order: Omit<DBProductionOrder, '_synced_at' | '_dirty'>): Promise<DBProductionOrder> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBProductionOrder = {
      ...order,
      created_at: order.created_at || now,
      updated_at: now,
      _dirty: true,
      _synced_at: undefined,
    };
    await db.production_orders.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, items, ...cleanPayload } = record as unknown as Record<string, unknown>;
    await enqueueOperation('production_orders', 'INSERT', record.id, cleanPayload);
    return record;
  },

  async update(id: string, changes: Partial<DBProductionOrder>): Promise<void> {
    const db = getDB();
    const now = new Date().toISOString();
    const updated = { ...changes, updated_at: now, _dirty: true };
    await db.production_orders.update(id, updated);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _dirty, _synced_at, items, ...cleanPayload } = updated as Record<string, unknown>;
    await enqueueOperation('production_orders', 'UPDATE', id, cleanPayload);
  },

  async delete(id: string): Promise<void> {
    const db = getDB();
    await db.production_orders.delete(id);
    await enqueueOperation('production_orders', 'DELETE', id, { id });
  },

  async count(): Promise<number> {
    const db = getDB();
    return db.production_orders.count();
  },
};

// ─── PO Catalog Repository ────────────────────────────────────────────────────

export const POCatalogRepo = {
  // Clientes
  async getClientes(): Promise<DBPOCliente[]> {
    const db = getDB();
    return db.po_clientes.orderBy('nombre').toArray();
  },
  async upsertCliente(item: DBPOCliente): Promise<void> {
    const db = getDB();
    await db.po_clientes.put(item);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = item as unknown as Record<string, unknown>;
    await enqueueOperation('po_clientes', item.id ? 'UPDATE' : 'INSERT', item.id, clean);
  },
  async saveCliente(item: Omit<DBPOCliente, '_synced_at'>): Promise<DBPOCliente> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOCliente = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_clientes.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    const op = item.id ? 'UPDATE' : 'INSERT';
    await enqueueOperation('po_clientes', op, record.id, clean);
    return record;
  },

  // Modelos
  async getModelos(): Promise<DBPOCatalogItem[]> {
    const db = getDB();
    return db.po_modelos_vehiculo.orderBy('orden').toArray();
  },
  async saveModelo(item: Omit<DBPOCatalogItem, '_synced_at'>): Promise<DBPOCatalogItem> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOCatalogItem = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_modelos_vehiculo.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    await enqueueOperation('po_modelos_vehiculo', item.id ? 'UPDATE' : 'INSERT', record.id, clean);
    return record;
  },

  // Niveles NIJ
  async getNiveles(): Promise<DBPOCatalogItem[]> {
    const db = getDB();
    return db.po_niveles_nij.orderBy('orden').toArray();
  },
  async saveNivel(item: Omit<DBPOCatalogItem, '_synced_at'>): Promise<DBPOCatalogItem> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOCatalogItem = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_niveles_nij.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    await enqueueOperation('po_niveles_nij', item.id ? 'UPDATE' : 'INSERT', record.id, clean);
    return record;
  },

  // Formas de pago
  async getFormasPago(): Promise<DBPOCatalogItem[]> {
    const db = getDB();
    return db.po_formas_pago.orderBy('orden').toArray();
  },
  async saveFormaPago(item: Omit<DBPOCatalogItem, '_synced_at'>): Promise<DBPOCatalogItem> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOCatalogItem = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_formas_pago.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    await enqueueOperation('po_formas_pago', item.id ? 'UPDATE' : 'INSERT', record.id, clean);
    return record;
  },

  // Incoterms
  async getIncoterms(): Promise<DBPOCatalogItem[]> {
    const db = getDB();
    return db.po_incoterms.orderBy('orden').toArray();
  },
  async saveIncoterm(item: Omit<DBPOCatalogItem, '_synced_at'>): Promise<DBPOCatalogItem> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOCatalogItem = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_incoterms.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    await enqueueOperation('po_incoterms', item.id ? 'UPDATE' : 'INSERT', record.id, clean);
    return record;
  },

  // Piezas de vidrio
  async getPiezas(): Promise<DBPOPiezaVidrio[]> {
    const db = getDB();
    return db.po_piezas_vidrio.orderBy('orden').toArray();
  },
  async savePieza(item: Omit<DBPOPiezaVidrio, '_synced_at'>): Promise<DBPOPiezaVidrio> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOPiezaVidrio = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_piezas_vidrio.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    await enqueueOperation('po_piezas_vidrio', item.id ? 'UPDATE' : 'INSERT', record.id, clean);
    return record;
  },

  // Tipos de marcación
  async getMarcaciones(): Promise<DBPOCatalogItem[]> {
    const db = getDB();
    return db.po_tipos_marcacion.orderBy('orden').toArray();
  },
  async saveMarcacion(item: Omit<DBPOCatalogItem, '_synced_at'>): Promise<DBPOCatalogItem> {
    const db = getDB();
    const now = new Date().toISOString();
    const record: DBPOCatalogItem = { ...item, updated_at: now, created_at: item.created_at || now };
    await db.po_tipos_marcacion.put(record);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _synced_at, ...clean } = record as unknown as Record<string, unknown>;
    await enqueueOperation('po_tipos_marcacion', item.id ? 'UPDATE' : 'INSERT', record.id, clean);
    return record;
  },

  // Bulk upsert for sync
  async bulkUpsertCatalogs(data: {
    clientes?: DBPOCliente[];
    modelos?: DBPOCatalogItem[];
    niveles?: DBPOCatalogItem[];
    formasPago?: DBPOCatalogItem[];
    incoterms?: DBPOCatalogItem[];
    piezas?: DBPOPiezaVidrio[];
    marcaciones?: DBPOCatalogItem[];
  }): Promise<void> {
    const db = getDB();
    const now = Date.now();
    if (data.clientes?.length) await db.po_clientes.bulkPut(data.clientes.map((i) => ({ ...i, _synced_at: now })));
    if (data.modelos?.length) await db.po_modelos_vehiculo.bulkPut(data.modelos.map((i) => ({ ...i, _synced_at: now })));
    if (data.niveles?.length) await db.po_niveles_nij.bulkPut(data.niveles.map((i) => ({ ...i, _synced_at: now })));
    if (data.formasPago?.length) await db.po_formas_pago.bulkPut(data.formasPago.map((i) => ({ ...i, _synced_at: now })));
    if (data.incoterms?.length) await db.po_incoterms.bulkPut(data.incoterms.map((i) => ({ ...i, _synced_at: now })));
    if (data.piezas?.length) await db.po_piezas_vidrio.bulkPut(data.piezas.map((i) => ({ ...i, _synced_at: now })));
    if (data.marcaciones?.length) await db.po_tipos_marcacion.bulkPut(data.marcaciones.map((i) => ({ ...i, _synced_at: now })));
  },
};
