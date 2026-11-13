import type { AvatarBodyType, AvatarConfig, AvatarHeightType } from '@/src/lib/avatar/types';
import type { SlotKey } from '@/src/types/models';

export interface SlotAnchorPreset {
  x: number;
  y: number;
  baseScale: number;
  maxWidthRatio: number;
}

const BASE_ANCHORS: Record<SlotKey, SlotAnchorPreset> = {
  acc_head: { x: 0.5, y: 0.09, baseScale: 0.72, maxWidthRatio: 0.34 },
  acc_neck: { x: 0.5, y: 0.25, baseScale: 0.65, maxWidthRatio: 0.3 },
  top: { x: 0.5, y: 0.36, baseScale: 0.96, maxWidthRatio: 0.56 },
  outerwear: { x: 0.5, y: 0.37, baseScale: 1.06, maxWidthRatio: 0.62 },
  dress: { x: 0.5, y: 0.48, baseScale: 1.12, maxWidthRatio: 0.62 },
  bottom: { x: 0.5, y: 0.63, baseScale: 0.98, maxWidthRatio: 0.54 },
  acc_hand: { x: 0.76, y: 0.52, baseScale: 0.68, maxWidthRatio: 0.34 },
  shoes: { x: 0.5, y: 0.89, baseScale: 0.78, maxWidthRatio: 0.44 },
};

const BODY_SCALE_MULTIPLIER: Record<AvatarBodyType, number> = {
  slim: 0.92,
  regular: 1.0,
  curvy: 1.11,
};

const BODY_HAND_X_OFFSET: Record<AvatarBodyType, number> = {
  slim: -0.02,
  regular: 0,
  curvy: 0.03,
};

const HEIGHT_MULTIPLIER: Record<AvatarHeightType, { scale: number; yOffset: number }> = {
  short: { scale: 0.94, yOffset: 0.03 },
  average: { scale: 1.0, yOffset: 0 },
  tall: { scale: 1.05, yOffset: -0.02 },
};

function clamp01(val: number): number {
  return Math.min(0.95, Math.max(0.05, Number(val.toFixed(3))));
}

export function getAdjustedAnchorForSlot(
  slotKey: SlotKey,
  avatarConfig: AvatarConfig,
): { anchor: { x: number; y: number }; scale: number; maxWidthRatio: number } {
  const base = BASE_ANCHORS[slotKey];
  const bodyMul = BODY_SCALE_MULTIPLIER[avatarConfig.body] ?? 1;
  const heightCfg = HEIGHT_MULTIPLIER[avatarConfig.height] ?? HEIGHT_MULTIPLIER.average;

  const isTorsoOrFull =
    slotKey === 'top' ||
    slotKey === 'bottom' ||
    slotKey === 'dress' ||
    slotKey === 'outerwear';

  const scale = Number(
    (base.baseScale * (isTorsoOrFull ? bodyMul : 1) * heightCfg.scale).toFixed(2),
  );

  const x =
    slotKey === 'acc_hand'
      ? clamp01(base.x + (BODY_HAND_X_OFFSET[avatarConfig.body] ?? 0))
      : base.x;

  // Los pies se mantienen anclados cerca del suelo; el torso ajusta su centro vertical
  const yFactor = slotKey === 'shoes' ? 0.35 : 1;
  const y = clamp01(base.y + heightCfg.yOffset * yFactor);

  return {
    anchor: { x, y },
    scale,
    maxWidthRatio: base.maxWidthRatio,
  };
}
