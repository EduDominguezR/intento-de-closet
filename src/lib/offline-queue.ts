import { createGarment, type CreateGarmentInput } from '@/src/firebase/firestore';
import { uploadGarmentAssets, type GarmentImageBlobs } from '@/src/firebase/storage';

const DB_NAME = 'closetly-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending-garments';

export interface QueuedGarmentUpload {
  id: string;
  userId: string;
  createdAtMs: number;
  metadata: Omit<CreateGarmentInput, 'imageFullPath' | 'imageThumbPath' | 'cutoutPath'>;
  blobs: GarmentImageBlobs;
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('byUser', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
  });
}

export async function enqueueOfflineGarment(item: QueuedGarmentUpload): Promise<void> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Error guardando prenda en cola offline.'));
    };
  });
}

export async function getPendingOfflineGarments(userId: string): Promise<QueuedGarmentUpload[]> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.objectStore(STORE_NAME).index('byUser');
    const request = index.getAll(IDBKeyRange.only(userId));
    request.onsuccess = () => {
      db.close();
      const items = (request.result as QueuedGarmentUpload[] | undefined) ?? [];
      resolve(items.sort((a, b) => a.createdAtMs - b.createdAtMs));
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('Error leyendo cola offline.'));
    };
  });
}

export async function removeOfflineGarment(id: string): Promise<void> {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('Error eliminando elemento de cola offline.'));
    };
  });
}

let flushingPromise: Promise<number> | null = null;

/**
 * Reintenta subir prendas pendientes al reconectar ('online') o al abrir la app.
 * No depende de Background Sync API para mantener compatibilidad con Safari/iOS.
 */
export async function flushOfflineGarments(userId: string): Promise<number> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 0;
  }
  if (flushingPromise) return flushingPromise;

  flushingPromise = (async () => {
    let syncedCount = 0;
    try {
      const pending = await getPendingOfflineGarments(userId);
      for (const item of pending) {
        const paths = await uploadGarmentAssets(item.userId, item.id, item.blobs);
        await createGarment(item.id, item.userId, {
          ...item.metadata,
          ...paths,
        });
        await removeOfflineGarment(item.id);
        syncedCount += 1;
      }
    } catch (error) {
      console.warn('Sincronización offline interrumpida; se reintentará al reconectar:', error);
    } finally {
      flushingPromise = null;
    }
    return syncedCount;
  })();

  return flushingPromise;
}
