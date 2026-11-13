import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from '@/src/firebase/config';
import {
  deleteGarmentAssets,
  deleteOutfitPreview,
  type GarmentStoragePaths,
} from '@/src/firebase/storage';
import { normalizeAvatarConfig } from '@/src/lib/avatar/mapping';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { CLOSED_TEMPLATE_3D_SET } from '@/src/lib/closet/constants';
import { validateOutfitItemsForWrite, validateOutfitWrite } from '@/src/lib/outfit/validation';
import type {
  AccessorySlot,
  Garment,
  GarmentCategory,
  GarmentTemplate3DId,
  LookbookEntry,
  LookbookOutfitSnapshot,
  Outfit,
  OutfitCollection,
  OutfitItem,
  UserProfile,
} from '@/src/types/models';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function sanitizeDisplayName(rawName: string | null | undefined, email: string): string {
  const candidate = (rawName || email.split('@')[0] || 'Usuario').trim();
  return candidate.slice(0, 80) || 'Usuario';
}

function sanitizeStringList(items: string[], maxItems: number, maxLength: number): string[] {
  return items
    .map((item) => item.trim().slice(0, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function sanitizeHexColor(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : '#8B7FD4';
}

export function generateFirestoreDocId(
  collectionName: 'garments' | 'outfits' | 'lookbook',
): string {
  return doc(collection(db, collectionName)).id;
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      uid,
      displayName: String(data.displayName || 'Usuario'),
      email: String(data.email || ''),
      avatarConfig: data.avatarConfig ? normalizeAvatarConfig(data.avatarConfig) : undefined,
      createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function ensureUserProfile(user: User, preferredName?: string): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  const email = (user.email || `${user.uid}@closetly.local`).slice(0, 160);
  const displayName = sanitizeDisplayName(preferredName || user.displayName, email);
  const path = `users/${user.uid}`;

  try {
    await setDoc(doc(db, 'users', user.uid), {
      displayName,
      email,
      createdAt: serverTimestamp(),
    });
    return {
      uid: user.uid,
      displayName,
      email,
      createdAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserAvatarConfig(
  uid: string,
  avatarConfig: AvatarConfig,
): Promise<void> {
  const path = `users/${uid}`;
  const normalized = normalizeAvatarConfig(avatarConfig);
  try {
    await updateDoc(doc(db, 'users', uid), {
      avatarConfig: {
        skin: sanitizeHexColor(normalized.skin),
        hair: {
          style: normalized.hair.style.trim().slice(0, 30) || 'wavy',
          color: sanitizeHexColor(normalized.hair.color),
        },
        body: normalized.body,
        height: normalized.height,
        renderer: normalized.renderer,
      },
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateUserDisplayName(uid: string, displayName: string): Promise<void> {
  const path = `users/${uid}`;
  const cleanName = displayName.trim().slice(0, 80);
  if (!cleanName) {
    throw new Error('El nombre no puede estar vacío.');
  }
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: cleanName,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/* -------------------------------------------------------------------------- */
/* Garments                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateGarmentInput {
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
  glbUrl?: string;
}

export interface UpdateGarmentInput {
  name?: string;
  category?: GarmentCategory;
  accessorySlot?: AccessorySlot;
  subcategory?: string;
  brand?: string;
  dominantColor?: string;
  season?: string[];
  occasion?: string[];
  tags?: string[];
  template3d?: GarmentTemplate3DId | '';
  glbUrl?: string;
}

function sanitizeTemplate3d(value: unknown): GarmentTemplate3DId | undefined {
  if (typeof value === 'string' && CLOSED_TEMPLATE_3D_SET.has(value)) {
    return value as GarmentTemplate3DId;
  }
  return undefined;
}

function mapGarmentDoc(id: string, data: Record<string, unknown>): Garment {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    category: data.category as GarmentCategory,
    accessorySlot: data.accessorySlot as AccessorySlot | undefined,
    subcategory: typeof data.subcategory === 'string' ? data.subcategory : undefined,
    brand: typeof data.brand === 'string' ? data.brand : undefined,
    dominantColor: String(data.dominantColor ?? '#8B7FD4'),
    season: Array.isArray(data.season) ? data.season.map(String) : [],
    occasion: Array.isArray(data.occasion) ? data.occasion.map(String) : [],
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    imageFullPath: String(data.imageFullPath ?? ''),
    imageThumbPath: String(data.imageThumbPath ?? ''),
    cutoutPath: String(data.cutoutPath ?? ''),
    template3d: sanitizeTemplate3d(data.template3d),
    glbUrl: typeof data.glbUrl === 'string' ? data.glbUrl : undefined,
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
    updatedAt: (data.updatedAt as Timestamp | undefined) ?? null,
  };
}

export async function fetchUserGarments(uid: string): Promise<Garment[]> {
  const path = `garments?userId=${uid}`;
  try {
    const q = query(
      collection(db, 'garments'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => mapGarmentDoc(docSnap.id, docSnap.data()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getGarmentById(garmentId: string): Promise<Garment | null> {
  const path = `garments/${garmentId}`;
  try {
    const snap = await getDoc(doc(db, 'garments', garmentId));
    if (!snap.exists()) return null;
    return mapGarmentDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createGarment(
  garmentId: string,
  uid: string,
  input: CreateGarmentInput,
): Promise<Garment> {
  const path = `garments/${garmentId}`;
  const name = input.name.trim().slice(0, 80) || 'Prenda sin nombre';
  const payload: Record<string, unknown> = {
    userId: uid,
    name,
    category: input.category,
    dominantColor: sanitizeHexColor(input.dominantColor),
    season: sanitizeStringList(input.season, 4, 30),
    occasion: sanitizeStringList(input.occasion, 5, 30),
    tags: sanitizeStringList(input.tags, 15, 30),
    imageFullPath: input.imageFullPath.slice(0, 300),
    imageThumbPath: input.imageThumbPath.slice(0, 300),
    cutoutPath: input.cutoutPath.slice(0, 300),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.category === 'accessory') {
    payload.accessorySlot = input.accessorySlot ?? 'neck';
  }
  if (input.subcategory?.trim()) {
    payload.subcategory = input.subcategory.trim().slice(0, 50);
  }
  if (input.brand?.trim()) {
    payload.brand = input.brand.trim().slice(0, 50);
  }
  const validTemplate3d = sanitizeTemplate3d(input.template3d);
  if (validTemplate3d) {
    payload.template3d = validTemplate3d;
  }
  if (input.glbUrl?.trim()) {
    payload.glbUrl = input.glbUrl.trim().slice(0, 500);
  }

  try {
    await setDoc(doc(db, 'garments', garmentId), payload);
    return {
      id: garmentId,
      userId: uid,
      name,
      category: input.category,
      accessorySlot: input.category === 'accessory' ? (input.accessorySlot ?? 'neck') : undefined,
      subcategory: typeof payload.subcategory === 'string' ? payload.subcategory : undefined,
      brand: typeof payload.brand === 'string' ? payload.brand : undefined,
      dominantColor: payload.dominantColor as string,
      season: payload.season as string[],
      occasion: payload.occasion as string[],
      tags: payload.tags as string[],
      imageFullPath: payload.imageFullPath as string,
      imageThumbPath: payload.imageThumbPath as string,
      cutoutPath: payload.cutoutPath as string,
      template3d: validTemplate3d,
      glbUrl: typeof payload.glbUrl === 'string' ? payload.glbUrl : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateGarment(garmentId: string, patch: UpdateGarmentInput): Promise<void> {
  const path = `garments/${garmentId}`;
  const updatePayload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (patch.name !== undefined) {
    const clean = patch.name.trim().slice(0, 80);
    if (!clean) throw new Error('El nombre de la prenda no puede quedar vacío.');
    updatePayload.name = clean;
  }
  if (patch.category !== undefined) {
    updatePayload.category = patch.category;
    if (patch.category === 'accessory') {
      updatePayload.accessorySlot = patch.accessorySlot ?? 'neck';
    } else {
      updatePayload.accessorySlot = deleteField();
    }
  } else if (patch.accessorySlot !== undefined) {
    updatePayload.accessorySlot = patch.accessorySlot;
  }

  if (patch.subcategory !== undefined) {
    updatePayload.subcategory = patch.subcategory.trim()
      ? patch.subcategory.trim().slice(0, 50)
      : deleteField();
  }
  if (patch.brand !== undefined) {
    updatePayload.brand = patch.brand.trim() ? patch.brand.trim().slice(0, 50) : deleteField();
  }
  if (patch.dominantColor !== undefined) {
    updatePayload.dominantColor = sanitizeHexColor(patch.dominantColor);
  }
  if (patch.season !== undefined) {
    updatePayload.season = sanitizeStringList(patch.season, 4, 30);
  }
  if (patch.occasion !== undefined) {
    updatePayload.occasion = sanitizeStringList(patch.occasion, 5, 30);
  }
  if (patch.tags !== undefined) {
    updatePayload.tags = sanitizeStringList(patch.tags, 15, 30);
  }
  if (patch.template3d !== undefined) {
    const validT = sanitizeTemplate3d(patch.template3d);
    updatePayload.template3d = validT ?? deleteField();
  }
  if (patch.glbUrl !== undefined) {
    updatePayload.glbUrl = patch.glbUrl.trim() ? patch.glbUrl.trim().slice(0, 500) : deleteField();
  }

  try {
    await updateDoc(doc(db, 'garments', garmentId), updatePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function countAffectedOutfitsForGarment(
  uid: string,
  garmentId: string,
): Promise<number> {
  const path = `outfits?userId=${uid}`;
  try {
    const outfitsSnap = await getDocs(
      query(collection(db, 'outfits'), where('userId', '==', uid)),
    );
    let count = 0;
    for (const outfitDoc of outfitsSnap.docs) {
      const items = (outfitDoc.data().items as OutfitItem[] | undefined) ?? [];
      if (items.some((item) => item.garmentId === garmentId)) {
        count += 1;
      }
    }
    return count;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

/**
 * Elimina una prenda de forma íntegra:
 * 1. Quita los items de esa prenda en todos los outfits afectados usando writeBatch.
 * 2. Elimina el documento de garments/{garmentId} en el mismo batch.
 * 3. Elimina los 3 archivos de Storage (full, thumb, cutout).
 */
export async function deleteGarmentAndCleanupOutfits(
  uid: string,
  garmentId: string,
  paths: GarmentStoragePaths,
): Promise<{ affectedOutfitsCount: number }> {
  const path = `garments/${garmentId}`;
  let affectedOutfitsCount = 0;

  try {
    const outfitsSnap = await getDocs(
      query(collection(db, 'outfits'), where('userId', '==', uid)),
    );

    const batch = writeBatch(db);
    for (const outfitDoc of outfitsSnap.docs) {
      const items = (outfitDoc.data().items as OutfitItem[] | undefined) ?? [];
      const filtered = items.filter((item) => item.garmentId !== garmentId);
      if (filtered.length !== items.length) {
        affectedOutfitsCount += 1;
        const validatedItems = validateOutfitItemsForWrite(filtered);
        batch.update(outfitDoc.ref, { items: validatedItems });
      }
    }

    batch.delete(doc(db, 'garments', garmentId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }

  await deleteGarmentAssets(paths);
  return { affectedOutfitsCount };
}

/* -------------------------------------------------------------------------- */
/* Outfits                                                                    */
/* -------------------------------------------------------------------------- */

export interface CreateOutfitInput {
  name: string;
  occasion?: string;
  collection: OutfitCollection;
  items: OutfitItem[];
  previewPath?: string;
}

function mapOutfitDoc(id: string, data: Record<string, unknown>): Outfit {
  return {
    id,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    occasion: typeof data.occasion === 'string' ? data.occasion : undefined,
    collection: (data.collection as OutfitCollection) ?? 'casual',
    items: Array.isArray(data.items) ? (data.items as OutfitItem[]) : [],
    previewPath: typeof data.previewPath === 'string' ? data.previewPath : undefined,
    lastWornOn: typeof data.lastWornOn === 'string' ? data.lastWornOn : undefined,
    wornCount: typeof data.wornCount === 'number' ? data.wornCount : undefined,
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
  };
}

export async function fetchUserOutfits(uid: string): Promise<Outfit[]> {
  const path = `outfits?userId=${uid}`;
  try {
    const q = query(
      collection(db, 'outfits'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => mapOutfitDoc(docSnap.id, docSnap.data()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getOutfitById(outfitId: string): Promise<Outfit | null> {
  const path = `outfits/${outfitId}`;
  try {
    const snap = await getDoc(doc(db, 'outfits', outfitId));
    if (!snap.exists()) return null;
    return mapOutfitDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createOutfit(
  outfitId: string,
  uid: string,
  input: CreateOutfitInput,
): Promise<Outfit> {
  const path = `outfits/${outfitId}`;
  const validated = validateOutfitWrite(input);

  const payload: Record<string, unknown> = {
    userId: uid,
    name: validated.name,
    collection: validated.collection,
    items: validated.items,
    createdAt: serverTimestamp(),
  };

  if (validated.occasion) {
    payload.occasion = validated.occasion;
  }
  if (validated.previewPath) {
    payload.previewPath = validated.previewPath;
  }

  try {
    await setDoc(doc(db, 'outfits', outfitId), payload);
    return {
      id: outfitId,
      userId: uid,
      name: validated.name,
      occasion: validated.occasion,
      collection: validated.collection,
      items: validated.items,
      previewPath: validated.previewPath,
      createdAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteOutfitAndPreview(
  outfitId: string,
  previewPath?: string,
): Promise<void> {
  const path = `outfits/${outfitId}`;
  try {
    await deleteDoc(doc(db, 'outfits', outfitId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
  await deleteOutfitPreview(previewPath);
}

/* -------------------------------------------------------------------------- */
/* Lookbook                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateLookbookEntryInput {
  outfitId: string;
  outfitSnapshot: LookbookOutfitSnapshot;
  photoPath: string;
  photoThumbPath: string;
  wornOn: string;
  note?: string;
  consentVersion: number;
}

function sanitizeLookbookSnapshot(snapshot: LookbookOutfitSnapshot): Record<string, unknown> {
  const clean: Record<string, unknown> = {
    name: snapshot.name.trim().slice(0, 80) || 'Outfit',
    items: snapshot.items.slice(0, 8).map((item) => ({
      garmentId: item.garmentId,
      layer: item.layer,
      slotKey: item.slotKey,
    })),
  };
  if (snapshot.previewPath?.trim()) {
    clean.previewPath = snapshot.previewPath.trim().slice(0, 300);
  }
  return clean;
}

function mapLookbookDoc(id: string, data: Record<string, unknown>): LookbookEntry {
  const rawSnap = (data.outfitSnapshot as Record<string, unknown> | undefined) ?? {};
  return {
    id,
    userId: String(data.userId ?? ''),
    outfitId: String(data.outfitId ?? ''),
    outfitSnapshot: {
      name: String(rawSnap.name ?? 'Outfit'),
      previewPath: typeof rawSnap.previewPath === 'string' ? rawSnap.previewPath : undefined,
      items: Array.isArray(rawSnap.items)
        ? (rawSnap.items as LookbookOutfitSnapshot['items'])
        : [],
    },
    photoPath: String(data.photoPath ?? ''),
    photoThumbPath: String(data.photoThumbPath ?? ''),
    wornOn: String(data.wornOn ?? ''),
    note: typeof data.note === 'string' ? data.note : undefined,
    consentVersion: Number(data.consentVersion ?? 1),
    createdAt: (data.createdAt as Timestamp | undefined) ?? null,
  };
}

export async function fetchUserLookbookEntries(uid: string): Promise<LookbookEntry[]> {
  const path = `lookbook?userId=${uid}`;
  try {
    const q = query(
      collection(db, 'lookbook'),
      where('userId', '==', uid),
      orderBy('wornOn', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => mapLookbookDoc(docSnap.id, docSnap.data()));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function getLookbookEntryById(entryId: string): Promise<LookbookEntry | null> {
  const path = `lookbook/${entryId}`;
  try {
    const snap = await getDoc(doc(db, 'lookbook', entryId));
    if (!snap.exists()) return null;
    return mapLookbookDoc(snap.id, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

/**
 * Crea la entrada del lookbook y actualiza atómicamente lastWornOn + wornCount (increment(1))
 * en el documento outfits/{outfitId} usando un único writeBatch.
 */
export async function createLookbookEntry(
  entryId: string,
  uid: string,
  input: CreateLookbookEntryInput,
): Promise<LookbookEntry> {
  const path = `lookbook/${entryId}`;
  const cleanSnapshot = sanitizeLookbookSnapshot(input.outfitSnapshot);
  const cleanNote = input.note?.trim().slice(0, 200);

  const payload: Record<string, unknown> = {
    userId: uid,
    outfitId: input.outfitId,
    outfitSnapshot: cleanSnapshot,
    photoPath: input.photoPath.slice(0, 300),
    photoThumbPath: input.photoThumbPath.slice(0, 300),
    wornOn: input.wornOn.slice(0, 10),
    consentVersion: input.consentVersion,
    createdAt: serverTimestamp(),
  };

  if (cleanNote) {
    payload.note = cleanNote;
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'lookbook', entryId), payload);
    batch.update(doc(db, 'outfits', input.outfitId), {
      lastWornOn: input.wornOn.slice(0, 10),
      wornCount: increment(1),
    });
    await batch.commit();

    return {
      id: entryId,
      userId: uid,
      outfitId: input.outfitId,
      outfitSnapshot: {
        name: String(cleanSnapshot.name),
        previewPath:
          typeof cleanSnapshot.previewPath === 'string' ? cleanSnapshot.previewPath : undefined,
        items: cleanSnapshot.items as LookbookOutfitSnapshot['items'],
      },
      photoPath: String(payload.photoPath),
      photoThumbPath: String(payload.photoThumbPath),
      wornOn: String(payload.wornOn),
      note: cleanNote || undefined,
      consentVersion: input.consentVersion,
      createdAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateLookbookEntryNote(entryId: string, note: string): Promise<void> {
  const path = `lookbook/${entryId}`;
  const cleanNote = note.trim().slice(0, 200);
  try {
    await updateDoc(doc(db, 'lookbook', entryId), {
      note: cleanNote || deleteField(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteLookbookEntryRecord(entryId: string): Promise<void> {
  const path = `lookbook/${entryId}`;
  try {
    await deleteDoc(doc(db, 'lookbook', entryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
