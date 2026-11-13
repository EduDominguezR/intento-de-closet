import type { AvatarConfig } from '@/src/lib/avatar/types';
import { getAdjustedAnchorForSlot } from '@/src/lib/outfit/anchors';
import type { Garment, OutfitItem, OutfitLayer, SlotKey } from '@/src/types/models';

export const LAYER_Z_INDEX: Record<OutfitLayer, number> = {
  shoes: 10,
  bottom: 20,
  top: 30,
  outerwear: 40,
  accessory: 50,
};

export const SLOT_LABELS: Record<SlotKey, string> = {
  shoes: 'Calzado',
  bottom: 'Inferior',
  top: 'Top',
  outerwear: 'Abrigo',
  dress: 'Vestido',
  acc_head: 'Cabeza',
  acc_neck: 'Cuello',
  acc_hand: 'Mano / Bolso',
};

export const ALL_SLOTS: SlotKey[] = [
  'acc_head',
  'acc_neck',
  'outerwear',
  'top',
  'dress',
  'bottom',
  'acc_hand',
  'shoes',
];

export function resolveGarmentSlot(garment: Garment): { slotKey: SlotKey; layer: OutfitLayer } {
  switch (garment.category) {
    case 'shoes':
      return { slotKey: 'shoes', layer: 'shoes' };
    case 'bottom':
      return { slotKey: 'bottom', layer: 'bottom' };
    case 'top':
      return { slotKey: 'top', layer: 'top' };
    case 'dress':
      return { slotKey: 'dress', layer: 'top' };
    case 'outerwear':
      return { slotKey: 'outerwear', layer: 'outerwear' };
    case 'accessory': {
      const acc = garment.accessorySlot ?? 'neck';
      return { slotKey: `acc_${acc}` as SlotKey, layer: 'accessory' };
    }
  }
}

/**
 * Aplica una prenda a su slot correspondiente respetando exclusión mutua:
 * - Un vestido ('dress') reemplaza 'top' y 'bottom'.
 * - Un 'top' o 'bottom' reemplaza al 'dress' si estaba puesto.
 * - Accesorios ocupan acc_head, acc_neck o acc_hand de manera independiente.
 */
export function applyGarmentToSlots(
  currentItems: OutfitItem[],
  garment: Garment,
  avatarConfig: AvatarConfig,
): OutfitItem[] {
  const { slotKey, layer } = resolveGarmentSlot(garment);
  const { anchor, scale } = getAdjustedAnchorForSlot(slotKey, avatarConfig);

  let next = currentItems.filter((item) => item.slotKey !== slotKey);

  if (slotKey === 'dress') {
    next = next.filter((item) => item.slotKey !== 'top' && item.slotKey !== 'bottom');
  } else if (slotKey === 'top' || slotKey === 'bottom') {
    next = next.filter((item) => item.slotKey !== 'dress');
  }

  const newItem: OutfitItem = {
    garmentId: garment.id,
    layer,
    slotKey,
    anchor,
    transform: {
      scale,
      rotation: 0,
    },
  };

  return [...next, newItem]
    .slice(0, 8)
    .sort((a, b) => LAYER_Z_INDEX[a.layer] - LAYER_Z_INDEX[b.layer]);
}

export function removeSlotFromItems(currentItems: OutfitItem[], slotKey: SlotKey): OutfitItem[] {
  return currentItems.filter((item) => item.slotKey !== slotKey);
}
