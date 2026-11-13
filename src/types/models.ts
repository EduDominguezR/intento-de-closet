import type { Timestamp } from 'firebase/firestore';
import type { AvatarConfig } from '@/src/lib/avatar/types';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  avatarConfig?: AvatarConfig;
  createdAt: Timestamp | Date | null;
}

export type GarmentCategory =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'shoes'
  | 'accessory';

export type AccessorySlot = 'head' | 'neck' | 'hand';

export type GarmentTemplate3DId =
  | 'tshirt'
  | 'longsleeve'
  | 'jacket'
  | 'pants'
  | 'shorts'
  | 'skirt'
  | 'dress'
  | 'shoes';

export interface Garment {
  id: string;
  userId: string;
  name: string;
  category: GarmentCategory;
  accessorySlot?: AccessorySlot;
  subcategory?: string;
  brand?: string;
  dominantColor: string;
  season: string[];
  occasion: string[];
  tags: string[];
  imageFullPath: string;
  imageThumbPath: string;
  cutoutPath: string;
  template3d?: GarmentTemplate3DId;
  // EXTENSION PHASE 3: URL de modelo .glb generado por Image-to-3D (solo visor aislado).
  glbUrl?: string;
  createdAt: Timestamp | Date | null;
  updatedAt: Timestamp | Date | null;
}

export type OutfitLayer = 'shoes' | 'bottom' | 'top' | 'outerwear' | 'accessory';

export type SlotKey =
  | 'shoes'
  | 'bottom'
  | 'top'
  | 'outerwear'
  | 'dress'
  | 'acc_head'
  | 'acc_neck'
  | 'acc_hand';

export type OutfitCollection = 'work' | 'party' | 'casual' | 'travel' | 'custom';

export interface OutfitItemPhotoTransform {
  cx: number;
  cy: number;
  scale: number;
  rotation: number;
  flipX: boolean;
}

export interface OutfitItem {
  garmentId: string;
  layer: OutfitLayer;
  slotKey: SlotKey;
  anchor: { x: number; y: number };
  transform: { scale: number; rotation: number };
  photoTransform?: OutfitItemPhotoTransform;
}

export interface Outfit {
  id: string;
  userId: string;
  name: string;
  occasion?: string;
  collection: OutfitCollection;
  items: OutfitItem[];
  previewPath?: string;
  lastWornOn?: string;
  wornCount?: number;
  createdAt: Timestamp | Date | null;
}

export interface LookbookOutfitSnapshotItem {
  garmentId: string;
  layer: OutfitLayer;
  slotKey: SlotKey;
}

export interface LookbookOutfitSnapshot {
  name: string;
  previewPath?: string;
  items: LookbookOutfitSnapshotItem[];
}

export interface LookbookEntry {
  id: string;
  userId: string;
  outfitId: string;
  outfitSnapshot: LookbookOutfitSnapshot;
  photoPath: string;
  photoThumbPath: string;
  wornOn: string; // 'YYYY-MM-DD'
  note?: string;
  consentVersion: number;
  createdAt: Timestamp | Date | null;
}

// EXTENSION PHASE 2: Colecciones reservadas para calendario y estadísticas (sin UI en MVP).
export interface CalendarEntry {
  id: string;
  userId: string;
  date: string; // 'YYYY-MM-DD'
  outfitId: string;
}

// EXTENSION PHASE 2: Registro histórico de prendas/outfits usados.
export interface OutfitUse {
  id: string;
  userId: string;
  outfitId: string;
  wornOn: string; // 'YYYY-MM-DD'
}
