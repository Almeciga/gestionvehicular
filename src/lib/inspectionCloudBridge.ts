'use client';

import { getInspections, type Inspection } from '@/lib/store';
import { getDB } from '@/lib/db';
import type { DBInspection } from '@/lib/db';

/**
 * Converts a Dexie DBInspection record to the legacy Inspection shape used
 * by the UI layer (store.ts / InspectionListView).
 */
function dbInspectionToStoreInspection(db: DBInspection): Inspection {
  const data = (db.data ?? {}) as Record<string, unknown>;
  return {
    id: db.local_id || db.id,
    enterpriseId: db.enterprise_id,
    placa: db.placa,
    marca: db.marca,
    modelo: db.modelo,
    color: db.color,
    propietario: db.propietario,
    fecha: db.fecha,
    status: db.status as Inspection['status'],
    seccionesCompletadas: db.secciones_completadas,
    totalSecciones: db.total_secciones,
    datos: data,
    createdAt: db.created_at ? new Date(db.created_at).getTime() : 0,
    updatedAt: db.updated_at ? new Date(db.updated_at).getTime() : undefined,
    inspectorId: db.inspector_id,
    inspectorName: db.inspector_name,
    isLocked: db.is_locked,
    finalizedAt: db.finalized_at ? new Date(db.finalized_at).getTime() : undefined,
    finalizedBy: db.finalized_by,
    finalizationTimestamp: db.finalization_timestamp,
    creationTimestamp: db.creation_timestamp,
    syncStatus: db.sync_status,
    lastSyncedAt: db._synced_at,
  };
}

/**
 * Returns a merged list of inspections from both:
 * 1. IndexedDB (Dexie) — cloud-synced records
 * 2. localStorage — legacy offline records not yet migrated
 *
 * IndexedDB records take precedence over localStorage records with the same
 * local_id / id to avoid duplicates.
 */
export async function hydrateLegacyInspectionsFromCloud(): Promise<Inspection[]> {
  // 1. Load from IndexedDB
  let dexieInspections: Inspection[] = [];
  try {
    const db = getDB();
    const records = await db.inspections.orderBy('updated_at').reverse().toArray();
    dexieInspections = records.map(dbInspectionToStoreInspection);
  } catch {
    // IndexedDB unavailable (private browsing, etc.) — fall through to localStorage
  }

  // 2. Load from localStorage (legacy)
  const localInspections = getInspections();

  if (dexieInspections.length === 0) {
    // No IndexedDB data — return localStorage list as-is
    return localInspections;
  }

  // 3. Merge: build a set of IDs already covered by IndexedDB
  const dexieIds = new Set<string>();
  dexieInspections.forEach((i) => {
    dexieIds.add(i.id);
    if (i.enterpriseId) dexieIds.add(i.enterpriseId);
  });

  // Keep only localStorage records that are NOT already in IndexedDB
  const localOnly = localInspections.filter(
    (i) => !dexieIds.has(i.id) && !(i.enterpriseId && dexieIds.has(i.enterpriseId))
  );

  // Combine: IndexedDB first (most up-to-date), then any local-only stragglers
  const merged = [...dexieInspections, ...localOnly];

  // Sort by updatedAt / createdAt descending
  merged.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));

  return merged;
}
