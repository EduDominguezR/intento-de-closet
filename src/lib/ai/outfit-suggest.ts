import type { AvatarConfig } from '@/src/lib/avatar/types';
import { applyGarmentToSlots } from '@/src/lib/outfit/slots';
import type { Garment, OutfitItem } from '@/src/types/models';

export interface SuggestOutfitInput {
  garments: Garment[];
  avatarConfig: AvatarConfig;
  occasion?: string;
  season?: string;
}

export interface SuggestOutfitResult {
  items: OutfitItem[];
  rationale: string;
}

/**
 * EXTENSION PHASE 2:
 * Esta interfaz alimentará el botón "Sorpréndeme" en Fase 2.
 * Reemplazar la implementación por reglas con llamada a LLM/API cuando se habilite.
 */
export function suggestOutfit(input: SuggestOutfitInput): SuggestOutfitResult {
  const { garments, avatarConfig, occasion, season } = input;
  const filtered = garments.filter((g) => {
    const okOccasion = !occasion || g.occasion.length === 0 || g.occasion.includes(occasion);
    const okSeason = !season || g.season.length === 0 || g.season.includes(season);
    return okOccasion && okSeason;
  });

  const pool = filtered.length > 0 ? filtered : garments;
  let items: OutfitItem[] = [];

  const dress = pool.find((g) => g.category === 'dress');
  if (dress) {
    items = applyGarmentToSlots(items, dress, avatarConfig);
  } else {
    const top = pool.find((g) => g.category === 'top');
    const bottom = pool.find((g) => g.category === 'bottom');
    if (top) items = applyGarmentToSlots(items, top, avatarConfig);
    if (bottom) items = applyGarmentToSlots(items, bottom, avatarConfig);
  }

  const shoes = pool.find((g) => g.category === 'shoes');
  if (shoes) items = applyGarmentToSlots(items, shoes, avatarConfig);

  return {
    items,
    rationale: 'Combinación base sugerida por categoría, ocasión y temporada.',
  };
}
