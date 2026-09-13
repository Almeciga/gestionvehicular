// ─── IndexedDB Offline Storage ─────────────────────────────────────────────
// Enterprise-grade offline persistence with crash recovery



const DB_NAME = 'gv_offline_db';
const DB_VERSION = 2;

export interface DraftInspection {
  id: string;
  localId: string;
  data: Record<string, unknown>;
  savedAt: number;
  placa?: string;
  inspectorId?: string;
}

export interface MediaUploadItem {
  id: string;
  inspectionId: string;
  fieldPath: string; // e.g. "accesorios[0].fotos[0]"
  dataUrl: string;   // base64 data URL
  mimeType: string;
  fileName: string;
  fileSize: number;
  status: 'pending' | 'uploading' | 'done' | 'failed' | 'retrying';
  retries: number;
  maxRetries: number;
  uploadedUrl?: string;
  storagePath?: string;
  errorMessage?: string;
  createdAt: number;
  lastAttempt?: number;
  checksum?: string; // for deduplication
}

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = (e.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains('drafts')) {
        const drafts = database.createObjectStore('drafts', { keyPath: 'localId' });
        drafts.createIndex('savedAt', 'savedAt');
        drafts.createIndex('inspectorId', 'inspectorId');
      }
      if (!database.objectStoreNames.contains('mediaQueue')) {
        const media = database.createObjectStore('mediaQueue', { keyPath: 'id' });
        media.createIndex('inspectionId', 'inspectionId');
        media.createIndex('status', 'status');
        media.createIndex('checksum', 'checksum');
      }
    };
    req.onsuccess = (e) => {
      db = (e.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

// ─── Draft API ─────────────────────────────────────────────────────────────

export async function saveDraft(draft: DraftInspection): Promise<void> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').put({ ...draft, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail — localStorage is fallback */ }
}

export async function getDraft(localId: string): Promise<DraftInspection | null> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').get(localId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function getAllDrafts(): Promise<DraftInspection[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('drafts', 'readonly');
      const req = tx.objectStore('drafts').getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function deleteDraft(localId: string): Promise<void> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('drafts', 'readwrite');
      tx.objectStore('drafts').delete(localId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail */ }
}

// ─── Media Upload Queue API ────────────────────────────────────────────────

/** Compute a simple checksum for deduplication */
export function computeChecksum(dataUrl: string): string {
  let hash = 0;
  const sample = dataUrl.slice(0, 500) + dataUrl.slice(-200) + dataUrl.length;
  for (let i = 0; i < sample.length; i++) {
    hash = ((hash << 5) - hash) + sample.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function enqueueMedia(item: Omit<MediaUploadItem, 'id' | 'retries' | 'status' | 'createdAt' | 'maxRetries'>): Promise<MediaUploadItem> {
  const checksum = computeChecksum(item.dataUrl);
  // Check for duplicate
  const existing = await getMediaByChecksum(checksum);
  if (existing && existing.inspectionId === item.inspectionId && existing.fieldPath === item.fieldPath) return existing;

  const newItem: MediaUploadItem = {
    ...item,
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    retries: 0,
    maxRetries: 5,
    status: 'pending',
    createdAt: Date.now(),
    checksum,
  };

  try {
    const database = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction('mediaQueue', 'readwrite');
      tx.objectStore('mediaQueue').put(newItem);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail */ }

  return newItem;
}

export async function getMediaByChecksum(checksum: string): Promise<MediaUploadItem | null> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('mediaQueue', 'readonly');
      const index = tx.objectStore('mediaQueue').index('checksum');
      const req = index.get(checksum);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function getPendingMediaItems(): Promise<MediaUploadItem[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('mediaQueue', 'readonly');
      const req = tx.objectStore('mediaQueue').getAll();
      req.onsuccess = () => {
        const all = (req.result ?? []) as MediaUploadItem[];
        resolve(all.filter((i) => i.status === 'pending' || i.status === 'failed' || i.status === 'retrying'));
      };
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function updateMediaItem(id: string, updates: Partial<MediaUploadItem>): Promise<void> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('mediaQueue', 'readwrite');
      const store = tx.objectStore('mediaQueue');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        if (getReq.result) {
          store.put({ ...getReq.result, ...updates });
        }
        resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  } catch { /* silently fail */ }
}

export async function removeMediaItem(id: string): Promise<void> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('mediaQueue', 'readwrite');
      tx.objectStore('mediaQueue').delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* silently fail */ }
}

export async function getMediaForInspection(inspectionId: string): Promise<MediaUploadItem[]> {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('mediaQueue', 'readonly');
      const index = tx.objectStore('mediaQueue').index('inspectionId');
      const req = index.getAll(inspectionId);
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function getPendingMediaCount(): Promise<number> {
  const items = await getPendingMediaItems();
  return items.length;
}
