import { z } from 'zod';
import type { OutfitCollection, OutfitItem } from '@/src/types/models';

export const outfitItemPhotoTransformSchema = z.object({
  cx: z.number().finite().min(0).max(1),
  cy: z.number().finite().min(0).max(1),
  scale: z.number().finite().gt(0).max(5),
  rotation: z.number().finite().min(-360).max(360),
  flipX: z.boolean(),
});

export const outfitItemSchema = z.object({
  garmentId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-zA-Z0-9_-]+$/, 'garmentId contiene caracteres no permitidos.'),
  layer: z.enum(['shoes', 'bottom', 'top', 'outerwear', 'accessory']),
  slotKey: z.enum([
    'shoes',
    'bottom',
    'top',
    'outerwear',
    'dress',
    'acc_head',
    'acc_neck',
    'acc_hand',
  ]),
  anchor: z.object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
  }),
  transform: z.object({
    scale: z.number().finite().gt(0).max(5),
    rotation: z.number().finite().min(-360).max(360),
  }),
  photoTransform: outfitItemPhotoTransformSchema.optional(),
});

export const outfitItemsWriteSchema = z.array(outfitItemSchema).max(8);

export const outfitWriteSchema = z.object({
  name: z.string().trim().min(1).max(80),
  occasion: z.string().trim().max(50).optional(),
  collection: z.enum(['work', 'party', 'casual', 'travel', 'custom']),
  items: outfitItemsWriteSchema,
  previewPath: z.string().trim().max(300).optional(),
});

export interface ValidatedOutfitWriteInput {
  name: string;
  occasion?: string;
  collection: OutfitCollection;
  items: OutfitItem[];
  previewPath?: string;
}

/**
 * Valida y normaliza la lista de items de un outfit antes de cualquier escritura en Firestore.
 * Firestore Rules no puede iterar listas, por lo que esta validación con Zod protege
 * cada prenda (incluido photoTransform opcional) en todas las escrituras de outfits.
 */
export function validateOutfitItemsForWrite(items: OutfitItem[]): OutfitItem[] {
  const parsed = outfitItemsWriteSchema.parse(items);
  return parsed.map((item) => {
    const clean: OutfitItem = {
      garmentId: item.garmentId,
      layer: item.layer,
      slotKey: item.slotKey,
      anchor: {
        x: Number(item.anchor.x.toFixed(4)),
        y: Number(item.anchor.y.toFixed(4)),
      },
      transform: {
        scale: Number(item.transform.scale.toFixed(3)),
        rotation: Number(item.transform.rotation.toFixed(2)),
      },
    };
    if (item.photoTransform) {
      clean.photoTransform = {
        cx: Number(item.photoTransform.cx.toFixed(4)),
        cy: Number(item.photoTransform.cy.toFixed(4)),
        scale: Number(item.photoTransform.scale.toFixed(3)),
        rotation: Number(item.photoTransform.rotation.toFixed(2)),
        flipX: item.photoTransform.flipX,
      };
    }
    return clean;
  });
}

export function validateOutfitWrite(input: ValidatedOutfitWriteInput): ValidatedOutfitWriteInput {
  const parsed = outfitWriteSchema.parse({
    ...input,
    name: input.name.trim().slice(0, 80) || 'Outfit sin nombre',
    occasion: input.occasion?.trim() ? input.occasion.trim().slice(0, 50) : undefined,
    previewPath: input.previewPath?.trim() ? input.previewPath.trim().slice(0, 300) : undefined,
  });

  return {
    name: parsed.name,
    occasion: parsed.occasion,
    collection: parsed.collection,
    items: validateOutfitItemsForWrite(parsed.items),
    previewPath: parsed.previewPath,
  };
}
