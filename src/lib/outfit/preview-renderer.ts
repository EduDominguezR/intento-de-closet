import { getStorageBlob } from '@/src/firebase/storage';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { canvasToBlob, loadImageFromSource } from '@/src/lib/image';
import { getAdjustedAnchorForSlot } from '@/src/lib/outfit/anchors';
import { LAYER_Z_INDEX } from '@/src/lib/outfit/slots';
import type { Garment, OutfitItem } from '@/src/types/models';

async function loadAvatarSvgImage(config: AvatarConfig): Promise<HTMLImageElement | null> {
  try {
    const response = await fetch('/avatar/mannequin.svg');
    if (!response.ok) return null;
    let svgText = await response.text();
    // Aplicar tono de piel básico al SVG estático para la vista previa compuesta
    svgText = svgText.replaceAll('#E8B89A', config.skin);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    return await loadImageFromSource(svgBlob);
  } catch {
    return null;
  }
}

export async function renderOutfitPreviewBlob(
  avatarConfig: AvatarConfig,
  items: OutfitItem[],
  garmentsById: Map<string, Garment>,
): Promise<Blob> {
  const width = 600;
  const height = 840;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo generar la vista previa del outfit.');

  // Fondo pastel suave
  ctx.fillStyle = '#FFFBFD';
  ctx.fillRect(0, 0, width, height);

  const grad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.45,
    40,
    width * 0.5,
    height * 0.45,
    width * 0.58,
  );
  grad.addColorStop(0, 'rgba(230, 224, 248, 0.55)');
  grad.addColorStop(1, 'rgba(255, 251, 253, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Dibujar maniquí base
  const avatarImg = await loadAvatarSvgImage(avatarConfig);
  if (avatarImg) {
    const avatarHeight = height * 0.88;
    const avatarWidth = (avatarImg.naturalWidth / Math.max(1, avatarImg.naturalHeight)) * avatarHeight;
    ctx.drawImage(
      avatarImg,
      (width - avatarWidth) / 2,
      (height - avatarHeight) / 2,
      avatarWidth,
      avatarHeight,
    );
  }

  // Dibujar prendas en orden de capas
  const ordered = [...items].sort((a, b) => LAYER_Z_INDEX[a.layer] - LAYER_Z_INDEX[b.layer]);

  for (const item of ordered) {
    const garment = garmentsById.get(item.garmentId);
    if (!garment) continue;
    try {
      const blob = await getStorageBlob(garment.cutoutPath || garment.imageFullPath);
      const img = await loadImageFromSource(blob);

      const preset = getAdjustedAnchorForSlot(item.slotKey, avatarConfig);
      const baseBoxWidth = width * preset.maxWidthRatio;
      const ratio = img.naturalHeight / Math.max(1, img.naturalWidth);
      const drawW = baseBoxWidth * item.transform.scale;
      const drawH = drawW * ratio;

      ctx.save();
      ctx.translate(item.anchor.x * width, item.anchor.y * height);
      ctx.rotate((item.transform.rotation * Math.PI) / 180);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } catch {
      // Si falla una imagen individual, continuar con el resto de la composición
    }
  }

  return canvasToBlob(canvas, 'image/webp', 0.85);
}
