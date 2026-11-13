import type { BodyPoseLandmarks } from '@/src/lib/photo/pose';
import type { OutfitItem, SlotKey } from '@/src/types/models';

const DB_NAME = 'closetly-photo-mode';
const DB_VERSION = 1;
const STORE_USER_PHOTOS = 'userPhotos';
const STORE_LOCAL_LOOKS = 'localLooks';

const CONSENT_STORAGE_PREFIX = 'closetly-photo-consent-v1:';

export const PHOTO_CONSENT_VERSION = 1;
export const PHOTO_CONSENT_HEADLINE = 'Tu foto se queda en este dispositivo';
export const PHOTO_CONSENT_DETAILS =
  'Tu foto de cuerpo completo se procesa y guarda únicamente en el almacenamiento local (IndexedDB) de este navegador. Nunca se sube a Firebase ni a ningún servidor externo. Puedes borrarla en cualquier momento.';

export interface LocalUserPhoto {
  uid: string;
  blob: Blob;
  width: number;
  height: number;
  updatedAt: number;
  pose?: BodyPoseLandmarks | null;
  personMaskBlob?: Blob | null;
}

export interface PhotoItemTransform {
  cx: number; // 0..1 relativo al ancho de la foto
  cy: number; // 0..1 relativo al alto de la foto
  scale: number; // 0.15..2.5 relativo al ancho de la foto
  rotation: number; // grados -180..180
  flipX: boolean;
  opacity: number; // 0.25..1
  zOffset: number; // ajuste fino de orden dentro de capas (-10..10)
}

export interface LocalPhotoLook {
  id: string;
  uid: string;
  name: string;
  blob: Blob;
  width: number;
  height: number;
  items: OutfitItem[];
  photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>>;
  createdAt: number;
}

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este navegador.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_USER_PHOTOS)) {
        db.createObjectStore(STORE_USER_PHOTOS, { keyPath: 'uid' });
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_LOOKS)) {
        const looksStore = db.createObjectStore(STORE_LOCAL_LOOKS, { keyPath: 'id' });
        looksStore.createIndex('byUid', 'uid', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('No se pudo abrir el almacenamiento local de fotos.'));
  });
}

export function hasPhotoModeConsent(uid: string): boolean {
  if (typeof window === 'undefined' || !uid) return false;
  try {
    return window.localStorage.getItem(`${CONSENT_STORAGE_PREFIX}${uid}`) === String(PHOTO_CONSENT_VERSION);
  } catch {
    return false;
  }
}

export function grantPhotoModeConsent(uid: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    window.localStorage.setItem(`${CONSENT_STORAGE_PREFIX}${uid}`, String(PHOTO_CONSENT_VERSION));
  } catch {
    // Ignorar en modo privado estricto
  }
}

export function clearPhotoModeConsent(uid: string): void {
  if (typeof window === 'undefined' || !uid) return;
  try {
    window.localStorage.removeItem(`${CONSENT_STORAGE_PREFIX}${uid}`);
  } catch {
    // Ignorar en modo privado estricto
  }
}

export async function getLocalUserPhoto(uid: string): Promise<LocalUserPhoto | null> {
  if (!uid) return null;
  const db = await openPhotoDb();
  try {
    return await new Promise<LocalUserPhoto | null>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_PHOTOS, 'readonly');
      const store = tx.objectStore(STORE_USER_PHOTOS);
      const req = store.get(uid);
      req.onsuccess = () => resolve((req.result as LocalUserPhoto | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('No se pudo leer tu foto local.'));
    });
  } finally {
    db.close();
  }
}

export async function hasLocalUserPhoto(uid: string): Promise<boolean> {
  try {
    const existing = await getLocalUserPhoto(uid);
    return existing !== null;
  } catch {
    return false;
  }
}

export async function saveLocalUserPhoto(photo: LocalUserPhoto): Promise<void> {
  const db = await openPhotoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_USER_PHOTOS, 'readwrite');
      const store = tx.objectStore(STORE_USER_PHOTOS);
      store.put(photo);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar tu foto localmente.'));
    });
  } finally {
    db.close();
  }
}

export async function saveLocalPhotoLook(look: LocalPhotoLook): Promise<void> {
  const db = await openPhotoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_LOOKS, 'readwrite');
      const store = tx.objectStore(STORE_LOCAL_LOOKS);
      store.put(look);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo guardar el look localmente.'));
    });
  } finally {
    db.close();
  }
}

export async function listLocalPhotoLooks(uid: string): Promise<LocalPhotoLook[]> {
  if (!uid) return [];
  const db = await openPhotoDb();
  try {
    return await new Promise<LocalPhotoLook[]>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_LOOKS, 'readonly');
      const store = tx.objectStore(STORE_LOCAL_LOOKS);
      const index = store.index('byUid');
      const req = index.getAll(IDBKeyRange.only(uid));
      req.onsuccess = () => {
        const list = ((req.result as LocalPhotoLook[] | undefined) ?? []).sort(
          (a, b) => b.createdAt - a.createdAt,
        );
        resolve(list);
      };
      req.onerror = () => reject(req.error ?? new Error('No se pudieron cargar los looks locales.'));
    });
  } finally {
    db.close();
  }
}

export async function deleteLocalPhotoLook(id: string): Promise<void> {
  if (!id) return;
  const db = await openPhotoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_LOCAL_LOOKS, 'readwrite');
      const store = tx.objectStore(STORE_LOCAL_LOOKS);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar el look local.'));
    });
  } finally {
    db.close();
  }
}

/**
 * Elimina de inmediato la foto del usuario y todos los looks locales asociados
 * en IndexedDB para el uid indicado.
 */
export async function deleteLocalUserPhotoAndLooks(uid: string): Promise<void> {
  if (!uid) return;
  const db = await openPhotoDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_USER_PHOTOS, STORE_LOCAL_LOOKS], 'readwrite');
      const photosStore = tx.objectStore(STORE_USER_PHOTOS);
      photosStore.delete(uid);

      const looksStore = tx.objectStore(STORE_LOCAL_LOOKS);
      const index = looksStore.index('byUid');
      const cursorReq = index.openKeyCursor(IDBKeyRange.only(uid));
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          looksStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('No se pudo borrar tu foto local.'));
    });
  } finally {
    db.close();
  }
}
