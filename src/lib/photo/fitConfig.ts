import type { BodyPoseLandmarks } from '@/src/lib/photo/pose';
import type { PhotoItemTransform } from '@/src/lib/photo/storage';
import type { Garment, SlotKey } from '@/src/types/models';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getDefaultPhotoTransformForSlot(slotKey: SlotKey): PhotoItemTransform {
  switch (slotKey) {
    case 'acc_head':
      return { cx: 0.5, cy: 0.14, scale: 0.22, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
    case 'acc_neck':
      return { cx: 0.5, cy: 0.26, scale: 0.2, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
    case 'outerwear':
      return { cx: 0.5, cy: 0.38, scale: 0.44, rotation: 0, flipX: false, opacity: 0.95, zOffset: 0 };
    case 'top':
      return { cx: 0.5, cy: 0.36, scale: 0.38, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
    case 'dress':
      return { cx: 0.5, cy: 0.48, scale: 0.42, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
    case 'bottom':
      return { cx: 0.5, cy: 0.62, scale: 0.38, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
    case 'acc_hand':
      return { cx: 0.68, cy: 0.54, scale: 0.22, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
    case 'shoes':
      return { cx: 0.5, cy: 0.87, scale: 0.28, rotation: 0, flipX: false, opacity: 0.96, zOffset: 0 };
  }
}

/**
 * Calcula posición, escala y rotación inicial de una prenda según los puntos de pose
 * detectados en el dispositivo. Si no hay pose válida, devuelve la posición por defecto.
 */
export function computeAutoPhotoTransform(
  slotKey: SlotKey,
  garment?: Garment | null,
  pose?: BodyPoseLandmarks | null,
): PhotoItemTransform {
  if (!pose || pose.status === 'not-found') {
    return getDefaultPhotoTransformForSlot(slotKey);
  }

  const sub = `${garment?.subcategory ?? ''} ${garment?.name ?? ''}`.toLowerCase();
  const tpl = garment?.template3d;
  const shoulderX = pose.shoulderMid.x;
  const hipX = pose.hipMid.x;
  const torsoCx = shoulderX * 0.62 + hipX * 0.38;

  switch (slotKey) {
    case 'acc_head': {
      return {
        cx: clamp(pose.headCenter.x, 0.08, 0.92),
        cy: clamp(pose.headCenter.y - pose.torsoHeight * 0.24, 0.05, 0.88),
        scale: clamp(Number((pose.headWidth * 1.38).toFixed(3)), 0.12, 0.48),
        rotation: pose.torsoAngleDeg,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }

    case 'acc_neck': {
      return {
        cx: clamp(pose.neckCenter.x, 0.08, 0.92),
        cy: clamp(pose.neckCenter.y + pose.torsoHeight * 0.09, 0.08, 0.9),
        scale: clamp(Number((pose.shoulderWidth * 0.62).toFixed(3)), 0.12, 0.46),
        rotation: pose.torsoAngleDeg,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }

    case 'top': {
      const isLongSleeve =
        tpl === 'longsleeve' || /(manga larga|sueter|suéter|sudadera|hoodie|camisa|blusa)/.test(sub);
      const widthMult = isLongSleeve ? 1.56 : 1.38;
      return {
        cx: clamp(torsoCx, 0.1, 0.9),
        cy: clamp(pose.shoulderMid.y + pose.torsoHeight * 0.43, 0.12, 0.85),
        scale: clamp(Number((pose.shoulderWidth * widthMult).toFixed(3)), 0.18, 0.85),
        rotation: pose.torsoAngleDeg,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }

    case 'outerwear': {
      return {
        cx: clamp(torsoCx, 0.1, 0.9),
        cy: clamp(pose.shoulderMid.y + pose.torsoHeight * 0.46, 0.12, 0.86),
        scale: clamp(Number((pose.shoulderWidth * 1.66).toFixed(3)), 0.2, 0.9),
        rotation: pose.torsoAngleDeg,
        flipX: false,
        opacity: 0.95,
        zOffset: 0,
      };
    }

    case 'dress': {
      const topY = pose.shoulderMid.y - pose.torsoHeight * 0.06;
      const bottomY = Math.min(0.92, pose.hipMid.y + pose.legHeight * 0.56);
      const widthBase = Math.max(pose.shoulderWidth * 1.44, pose.hipWidth * 1.78);
      return {
        cx: clamp((torsoCx + pose.hipMid.x) / 2, 0.1, 0.9),
        cy: clamp((topY + bottomY) / 2, 0.16, 0.84),
        scale: clamp(Number(widthBase.toFixed(3)), 0.2, 0.88),
        rotation: pose.torsoAngleDeg,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }

    case 'bottom': {
      const waistY = pose.hipMid.y - pose.torsoHeight * 0.14;
      const isShorts = tpl === 'shorts' || /(short|bermuda)/.test(sub);
      const isSkirt = tpl === 'skirt' || /(falda|skirt)/.test(sub);

      if (isShorts) {
        const bottomY = pose.hipMid.y + pose.legHeight * 0.36;
        return {
          cx: clamp(pose.hipMid.x, 0.1, 0.9),
          cy: clamp((waistY + bottomY) / 2, 0.2, 0.88),
          scale: clamp(Number(Math.max(pose.hipWidth * 1.54, pose.shoulderWidth * 0.94).toFixed(3)), 0.18, 0.82),
          rotation: Math.round(pose.torsoAngleDeg * 0.5),
          flipX: false,
          opacity: 0.96,
          zOffset: 0,
        };
      }

      if (isSkirt) {
        const bottomY = pose.hipMid.y + pose.legHeight * 0.54;
        return {
          cx: clamp(pose.hipMid.x, 0.1, 0.9),
          cy: clamp((waistY + bottomY) / 2, 0.2, 0.88),
          scale: clamp(Number(Math.max(pose.hipWidth * 1.82, pose.shoulderWidth * 1.12).toFixed(3)), 0.2, 0.88),
          rotation: Math.round(pose.torsoAngleDeg * 0.5),
          flipX: false,
          opacity: 0.96,
          zOffset: 0,
        };
      }

      const legDx = pose.ankleMid.x - pose.hipMid.x;
      const legDy = Math.max(0.1, pose.ankleMid.y - pose.hipMid.y);
      const legTiltDeg = Math.round(clamp((-Math.atan2(legDx, legDy) * 180) / Math.PI, -18, 18));

      return {
        cx: clamp((pose.hipMid.x * 0.65 + pose.ankleMid.x * 0.35), 0.1, 0.9),
        cy: clamp((waistY + pose.ankleMid.y) / 2, 0.25, 0.88),
        scale: clamp(Number(Math.max(pose.hipWidth * 1.56, pose.shoulderWidth * 0.98).toFixed(3)), 0.18, 0.85),
        rotation: legTiltDeg,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }

    case 'shoes': {
      return {
        cx: clamp(pose.ankleMid.x, 0.1, 0.9),
        cy: clamp(pose.ankleMid.y + pose.bodyHeightRatio * 0.035, 0.35, 0.94),
        scale: clamp(Number(Math.max(pose.hipWidth * 1.32, pose.shoulderWidth * 0.78).toFixed(3)), 0.14, 0.58),
        rotation: 0,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }

    case 'acc_hand': {
      return {
        cx: clamp(pose.handPoint.x, 0.08, 0.92),
        cy: clamp(pose.handPoint.y + pose.bodyHeightRatio * 0.05, 0.15, 0.92),
        scale: clamp(Number(Math.max(0.16, pose.shoulderWidth * 0.68).toFixed(3)), 0.12, 0.48),
        rotation: 0,
        flipX: false,
        opacity: 0.96,
        zOffset: 0,
      };
    }
  }
}
