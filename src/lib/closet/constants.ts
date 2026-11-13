import type { AccessorySlot, GarmentCategory, GarmentTemplate3DId } from '@/src/types/models';

export const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  top: 'Top / Blusa',
  bottom: 'Pantalón / Falda',
  dress: 'Vestido',
  outerwear: 'Chamarra / Abrigo',
  shoes: 'Calzado',
  accessory: 'Accesorio',
};

export const CATEGORY_SHORT_LABELS: Record<GarmentCategory, string> = {
  top: 'Tops',
  bottom: 'Inferior',
  dress: 'Vestidos',
  outerwear: 'Abrigos',
  shoes: 'Calzado',
  accessory: 'Accesorios',
};

export const ACCESSORY_SLOT_LABELS: Record<AccessorySlot, string> = {
  head: 'Cabeza',
  neck: 'Cuello',
  hand: 'Mano / Bolso',
};

export interface Template3DOption {
  id: GarmentTemplate3DId;
  label: string;
  categories: GarmentCategory[];
  description: string;
}

export const GARMENT_TEMPLATE_OPTIONS: Template3DOption[] = [
  { id: 'tshirt', label: 'Camiseta / Top', categories: ['top'], description: 'Manga corta sobre torso' },
  { id: 'longsleeve', label: 'Manga larga / Suéter', categories: ['top', 'outerwear'], description: 'Brazos cubiertos' },
  { id: 'jacket', label: 'Chamarra / Blazer', categories: ['outerwear'], description: 'Capa exterior abierta' },
  { id: 'pants', label: 'Pantalón / Jeans', categories: ['bottom'], description: 'Pierna completa' },
  { id: 'shorts', label: 'Shorts / Bermudas', categories: ['bottom'], description: 'Corte corto' },
  { id: 'skirt', label: 'Falda', categories: ['bottom'], description: 'Silueta acampanada' },
  { id: 'dress', label: 'Vestido', categories: ['dress'], description: 'Pieza completa torso + falda' },
  { id: 'shoes', label: 'Calzado', categories: ['shoes'], description: 'Par ajustado al piso' },
];

export const TEMPLATE_3D_LABELS: Record<GarmentTemplate3DId, string> = {
  tshirt: 'Camiseta / Top',
  longsleeve: 'Manga larga / Suéter',
  jacket: 'Chamarra / Blazer',
  pants: 'Pantalón / Jeans',
  shorts: 'Shorts / Bermudas',
  skirt: 'Falda',
  dress: 'Vestido',
  shoes: 'Calzado',
};

export const CLOSED_TEMPLATE_3D_SET = new Set<string>(
  GARMENT_TEMPLATE_OPTIONS.map((opt) => opt.id),
);

export function suggestTemplate3dForCategory(
  category: GarmentCategory | '',
  subcategory = '',
): GarmentTemplate3DId | undefined {
  const sub = subcategory.toLowerCase();
  if (category === 'top') {
    if (/(sueter|suéter|manga larga|camisa|hoodie|sudadera|cardigan)/.test(sub)) {
      return 'longsleeve';
    }
    return 'tshirt';
  }
  if (category === 'outerwear') return 'jacket';
  if (category === 'bottom') {
    if (/(falda|skirt)/.test(sub)) return 'skirt';
    if (/(short|bermuda)/.test(sub)) return 'shorts';
    return 'pants';
  }
  if (category === 'dress') return 'dress';
  if (category === 'shoes') return 'shoes';
  return undefined;
}

export const SEASON_OPTIONS = ['Primavera', 'Verano', 'Otoño', 'Invierno'] as const;
export const OCCASION_OPTIONS = ['Casual', 'Trabajo', 'Fiesta', 'Viaje', 'Deporte'] as const;

export interface ColorFamilyOption {
  id: string;
  label: string;
  hex: string;
}

export const COLOR_FAMILIES: ColorFamilyOption[] = [
  { id: 'white', label: 'Blanco / Crema', hex: '#F5F0F6' },
  { id: 'black', label: 'Negro', hex: '#2D2A35' },
  { id: 'gray', label: 'Gris', hex: '#9E97AD' },
  { id: 'beige', label: 'Beige / Café', hex: '#C8A98A' },
  { id: 'pink', label: 'Rosa', hex: '#FADADD' },
  { id: 'purple', label: 'Lavanda / Morado', hex: '#8B7FD4' },
  { id: 'blue', label: 'Azul', hex: '#6C9BD2' },
  { id: 'green', label: 'Verde', hex: '#7AC7A2' },
  { id: 'red', label: 'Rojo / Coral', hex: '#E57A84' },
  { id: 'yellow', label: 'Amarillo', hex: '#E9C46A' },
];

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return [139, 127, 212];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function classifyHexColorFamily(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : l > 0.5 ? d / (2 - max - min) : d / (max + min);

  if (s < 0.16) {
    if (l >= 0.8) return 'white';
    if (l <= 0.25) return 'black';
    return 'gray';
  }

  let h = 0;
  if (d > 0) {
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    else if (max === gn) h = ((bn - rn) / d + 2) * 60;
    else h = ((rn - gn) / d + 4) * 60;
  }

  if (h >= 20 && h <= 45 && s < 0.55) return 'beige';
  if (h >= 315 || h < 15) return l > 0.72 ? 'pink' : 'red';
  if (h >= 15 && h < 45) return l > 0.75 ? 'beige' : 'red';
  if (h >= 45 && h < 72) return 'yellow';
  if (h >= 72 && h < 168) return 'green';
  if (h >= 168 && h < 250) return 'blue';
  if (h >= 250 && h < 315) return 'purple';
  return 'gray';
}
