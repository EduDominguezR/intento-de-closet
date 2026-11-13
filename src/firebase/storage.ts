import {
  deleteObject,
  getBlob,
  getDownloadURL,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from 'firebase/storage';
import { storage } from '@/src/firebase/config';

export interface GarmentStoragePaths {
  imageFullPath: string;
  imageThumbPath: string;
  cutoutPath: string;
}

export interface GarmentImageBlobs {
  full: Blob;
  thumb: Blob;
  cutout: Blob;
}

const MAX_STORAGE_BYTES = 3 * 1024 * 1024; // 3 MB (prendas y previews de outfits)
const MAX_LOOKBOOK_STORAGE_BYTES = 5 * 1024 * 1024; // 5 MB (fotos del lookbook)

export function buildGarmentPaths(uid: string, garmentId: string): GarmentStoragePaths {
  return {
    imageFullPath: `garments/${uid}/${garmentId}_full.webp`,
    imageThumbPath: `garments/${uid}/${garmentId}_thumb.webp`,
    cutoutPath: `garments/${uid}/${garmentId}_cutout.webp`,
  };
}

export function buildOutfitPreviewPath(uid: string, outfitId: string): string {
  return `outfits/${uid}/${outfitId}_preview.webp`;
}

export interface LookbookStoragePaths {
  photoPath: string;
  photoThumbPath: string;
}

export interface LookbookImageBlobs {
  full: Blob;
  thumb: Blob;
}

export function buildLookbookPaths(uid: string, entryId: string): LookbookStoragePaths {
  return {
    photoPath: `lookbook/${uid}/${entryId}.webp`,
    photoThumbPath: `lookbook/${uid}/${entryId}_thumb.webp`,
  };
}

function assertValidImageBlob(blob: Blob, label: string, maxBytes = MAX_STORAGE_BYTES): void {
  if (blob.size >= maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new Error(`La imagen (${label}) excede el límite de ${mb} MB.`);
  }
  const type = blob.type || 'image/webp';
  if (!/^image\/(webp|png|jpeg)$/.test(type)) {
    throw new Error(`Formato no permitido para ${label}: ${type}`);
  }
}

function uploadBlobWithProgress(
  path: string,
  blob: Blob,
  onProgress?: (percent: number) => void,
  maxBytes = MAX_STORAGE_BYTES,
): Promise<string> {
  assertValidImageBlob(blob, path, maxBytes);
  const storageRef = ref(storage, path);
  const contentType = blob.type || 'image/webp';

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, {
      contentType,
      cacheControl: 'public, max-age=31536000',
    });

    task.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        if (onProgress && snapshot.totalBytes > 0) {
          onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      },
      (error) => reject(error),
      () => resolve(path),
    );
  });
}

export async function uploadGarmentAssets(
  uid: string,
  garmentId: string,
  blobs: GarmentImageBlobs,
  onProgress?: (percent: number) => void,
): Promise<GarmentStoragePaths> {
  const paths = buildGarmentPaths(uid, garmentId);
  const progressState = { full: 0, thumb: 0, cutout: 0 };

  const emitAggregate = () => {
    if (!onProgress) return;
    const avg = Math.round((progressState.full + progressState.thumb + progressState.cutout) / 3);
    onProgress(avg);
  };

  await Promise.all([
    uploadBlobWithProgress(paths.imageFullPath, blobs.full, (pct) => {
      progressState.full = pct;
      emitAggregate();
    }),
    uploadBlobWithProgress(paths.imageThumbPath, blobs.thumb, (pct) => {
      progressState.thumb = pct;
      emitAggregate();
    }),
    uploadBlobWithProgress(paths.cutoutPath, blobs.cutout, (pct) => {
      progressState.cutout = pct;
      emitAggregate();
    }),
  ]);

  return paths;
}

export async function uploadOutfitPreview(
  uid: string,
  outfitId: string,
  previewBlob: Blob,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const path = buildOutfitPreviewPath(uid, outfitId);
  return uploadBlobWithProgress(path, previewBlob, onProgress);
}

export async function uploadLookbookAssets(
  uid: string,
  entryId: string,
  blobs: LookbookImageBlobs,
  onProgress?: (percent: number) => void,
): Promise<LookbookStoragePaths> {
  const paths = buildLookbookPaths(uid, entryId);
  const progressState = { full: 0, thumb: 0 };

  const emitAggregate = () => {
    if (!onProgress) return;
    const avg = Math.round((progressState.full + progressState.thumb) / 2);
    onProgress(avg);
  };

  await Promise.all([
    uploadBlobWithProgress(
      paths.photoPath,
      blobs.full,
      (pct) => {
        progressState.full = pct;
        emitAggregate();
      },
      MAX_LOOKBOOK_STORAGE_BYTES,
    ),
    uploadBlobWithProgress(
      paths.photoThumbPath,
      blobs.thumb,
      (pct) => {
        progressState.thumb = pct;
        emitAggregate();
      },
      MAX_LOOKBOOK_STORAGE_BYTES,
    ),
  ]);

  return paths;
}

async function safeDeleteStorageObject(path: string): Promise<void> {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== 'storage/object-not-found') {
      throw error;
    }
  }
}

export async function deleteGarmentAssets(paths: GarmentStoragePaths): Promise<void> {
  await Promise.all([
    safeDeleteStorageObject(paths.imageFullPath),
    safeDeleteStorageObject(paths.imageThumbPath),
    safeDeleteStorageObject(paths.cutoutPath),
  ]);
}

export async function deleteOutfitPreview(previewPath?: string): Promise<void> {
  if (!previewPath) return;
  await safeDeleteStorageObject(previewPath);
}

export async function deleteLookbookAssets(paths: LookbookStoragePaths): Promise<void> {
  await Promise.all([
    safeDeleteStorageObject(paths.photoPath),
    safeDeleteStorageObject(paths.photoThumbPath),
  ]);
}

/**
 * Nota de seguridad: getDownloadURL() devuelve URLs firmadas con token que no
 * pasan por storage.rules al consultarse; no deben compartirse fuera de la sesión.
 * Para el Lookbook, se usa exclusivamente getStorageBlob().
 */
export async function getStorageDownloadUrl(path: string): Promise<string> {
  return getDownloadURL(ref(storage, path));
}

export async function getStorageBlob(path: string): Promise<Blob> {
  return getBlob(ref(storage, path));
}
