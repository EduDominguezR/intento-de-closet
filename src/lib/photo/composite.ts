import { getStorageBlob } from '@/src/firebase/storage';
import { LAYER_Z_INDEX } from '@/src/lib/outfit/slots';
import { getDefaultPhotoTransformForSlot } from '@/src/lib/photo/fitConfig';
import { cropCutoutToOpaqueBounds, type CroppedCutoutAsset } from '@/src/lib/photo/image';
import { buildForegroundOcclusionCanvas } from '@/src/lib/photo/occlusion';
import type { LocalUserPhoto, PhotoItemTransform } from '@/src/lib/photo/storage';
import type { Garment, OutfitItem, SlotKey } from '@/src/types/models';

const OVER_OCCLUSION_SLOTS = new Set<SlotKey>(['acc_head', 'acc_hand']);

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la foto para generar el look.'));
    };
    img.src = url;
  });
}

/**
 * Renderiza la composición final en WebP (foto + prendas por capa + sombra multiply
 * + oclusión corporal opcional) lista para guardar localmente en IndexedDB o, si el
 * usuario lo autoriza explícitamente, subir como portada privada.
 */
export async function renderPhotoCompositeBlob(params: {
  photo: LocalUserPhoto;
  items: OutfitItem[];
  garmentsById: Map<string, Garment>;
  photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>>;
  occlusionEnabled: boolean;
}): Promise<{ blob: Blob; width: number; height: number }> {
  const { photo, items, garmentsById, photoTransforms, occlusionEnabled } = params;
  const maxSide = 1200;
  const srcMax = Math.max(photo.width, photo.height, 1);
  const scale = srcMax > maxSide ? maxSide / srcMax : 1;
  const width = Math.max(1, Math.round(photo.width * scale));
  const height = Math.max(1, Math.round(photo.height * scale));

  const bgImage = await loadImageFromBlob(photo.blob);

  const orderedItems = [...items].sort((a, b) => {
    const za = LAYER_Z_INDEX[a.layer] + (photoTransforms[a.slotKey]?.zOffset ?? 0) * 0.1;
    const zb = LAYER_Z_INDEX[b.layer] + (photoTransforms[b.slotKey]?.zOffset ?? 0) * 0.1;
    return za - zb;
  });

  const cutoutMap = new Map<string, CroppedCutoutAsset>();
  await Promise.all(
    orderedItems.map(async (item) => {
      const g = garmentsById.get(item.garmentId);
      if (!g?.cutoutPath || cutoutMap.has(g.cutoutPath)) return;
      try {
        const blob = await getStorageBlob(g.cutoutPath);
        const cropped = await cropCutoutToOpaqueBounds(blob);
        cutoutMap.set(g.cutoutPath, cropped);
      } catch {
        // Ignorar prenda si falla descarga offline puntual
      }
    }),
  );

  const occlusionCanvas = occlusionEnabled
    ? await buildForegroundOcclusionCanvas(photo, photo.pose)
    : null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo inicializar el compositor para guardar el look.');
  }

  ctx.drawImage(bgImage, 0, 0, width, height);

  const drawItem = (item: OutfitItem) => {
    const garment = garmentsById.get(item.garmentId);
    if (!garment) return;
    const asset = cutoutMap.get(garment.cutoutPath);
    if (!asset) return;

    const t = photoTransforms[item.slotKey] ?? getDefaultPhotoTransformForSlot(item.slotKey);
    const cxPx = t.cx * width;
    const cyPx = t.cy * height;
    const targetW = t.scale * width;
    const targetH = targetW * (asset.height / Math.max(1, asset.width));
    const rotRad = (t.rotation * Math.PI) / 180;

    ctx.save();
    ctx.translate(cxPx + 3, cyPx + 6);
    ctx.rotate(rotRad);
    ctx.scale(t.flipX ? -1 : 1, 1);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.16 * t.opacity;
    ctx.filter = 'blur(5px) brightness(0.35)';
    ctx.drawImage(asset.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();

    ctx.save();
    ctx.translate(cxPx, cyPx);
    ctx.rotate(rotRad);
    ctx.scale(t.flipX ? -1 : 1, 1);
    ctx.globalAlpha = t.opacity;
    ctx.filter = 'blur(0.45px)';
    ctx.drawImage(asset.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.filter = 'none';
    ctx.drawImage(asset.canvas, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
  };

  for (const item of orderedItems) {
    if (!OVER_OCCLUSION_SLOTS.has(item.slotKey)) {
      drawItem(item);
    }
  }

  if (occlusionCanvas) {
    ctx.save();
    ctx.globalAlpha = 0.94;
    ctx.drawImage(occlusionCanvas, 0, 0, width, height);
    ctx.restore();
  }

  for (const item of orderedItems) {
    if (OVER_OCCLUSION_SLOTS.has(item.slotKey)) {
      drawItem(item);
    }
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (res) => {
        if (res) resolve(res);
        else reject(new Error('No se pudo exportar la imagen del look.'));
      },
      'image/webp',
      0.9,
    );
  });

  return { blob, width, height };
}
