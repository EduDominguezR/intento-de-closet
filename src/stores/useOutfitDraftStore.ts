import { create } from 'zustand';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import { applyGarmentToSlots, removeSlotFromItems } from '@/src/lib/outfit/slots';
import {
  computeAutoPhotoTransform,
  getDefaultPhotoTransformForSlot,
} from '@/src/lib/photo/fitConfig';
import type { BodyPoseLandmarks } from '@/src/lib/photo/pose';
import type { PhotoItemTransform } from '@/src/lib/photo/storage';
import type { Garment, OutfitItem, SlotKey } from '@/src/types/models';

export { getDefaultPhotoTransformForSlot };

interface OutfitDraftState {
  items: OutfitItem[];
  selectedSlotKey: SlotKey | null;
  activePose: BodyPoseLandmarks | null;
  photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>>;
  setActivePose: (pose: BodyPoseLandmarks | null) => void;
  applyGarment: (garment: Garment, avatarConfig: AvatarConfig) => void;
  removeSlot: (slotKey: SlotKey) => void;
  selectSlot: (slotKey: SlotKey | null) => void;
  updateItemPosition: (slotKey: SlotKey, anchor: { x: number; y: number }) => void;
  updateItemTransform: (slotKey: SlotKey, transform: Partial<{ scale: number; rotation: number }>) => void;
  updatePhotoTransform: (slotKey: SlotKey, patch: Partial<PhotoItemTransform>) => void;
  resetPhotoTransform: (slotKey: SlotKey, garment?: Garment | null) => void;
  recalculateAllPhotoTransforms: (
    garmentsById: Map<string, Garment>,
    poseOverride?: BodyPoseLandmarks | null,
  ) => void;
  bumpPhotoLayer: (slotKey: SlotKey, delta: number) => void;
  loadItems: (items: OutfitItem[]) => void;
  loadPhotoLook: (
    items: OutfitItem[],
    photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>>,
  ) => void;
  clearDraft: () => void;
}

export const useOutfitDraftStore = create<OutfitDraftState>((set) => ({
  items: [],
  selectedSlotKey: null,
  activePose: null,
  photoTransforms: {},
  setActivePose: (pose) => set({ activePose: pose }),
  applyGarment: (garment, avatarConfig) =>
    set((state) => {
      const next = applyGarmentToSlots(state.items, garment, avatarConfig);
      const applied = next.find((i) => i.garmentId === garment.id);
      const nextPhotoTransforms: Partial<Record<SlotKey, PhotoItemTransform>> = {};
      for (const item of next) {
        nextPhotoTransforms[item.slotKey] =
          state.photoTransforms[item.slotKey] ??
          computeAutoPhotoTransform(item.slotKey, undefined, state.activePose);
      }
      if (applied) {
        nextPhotoTransforms[applied.slotKey] = computeAutoPhotoTransform(
          applied.slotKey,
          garment,
          state.activePose,
        );
      }
      return {
        items: next,
        selectedSlotKey: applied?.slotKey ?? state.selectedSlotKey,
        photoTransforms: nextPhotoTransforms,
      };
    }),
  removeSlot: (slotKey) =>
    set((state) => {
      const nextPhotoTransforms = { ...state.photoTransforms };
      delete nextPhotoTransforms[slotKey];
      return {
        items: removeSlotFromItems(state.items, slotKey),
        selectedSlotKey: state.selectedSlotKey === slotKey ? null : state.selectedSlotKey,
        photoTransforms: nextPhotoTransforms,
      };
    }),
  selectSlot: (slotKey) => set({ selectedSlotKey: slotKey }),
  updateItemPosition: (slotKey, anchor) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.slotKey === slotKey
          ? {
              ...item,
              anchor: {
                x: Math.min(0.95, Math.max(0.05, Number(anchor.x.toFixed(3)))),
                y: Math.min(0.95, Math.max(0.05, Number(anchor.y.toFixed(3)))),
              },
            }
          : item,
      ),
    })),
  updateItemTransform: (slotKey, transform) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.slotKey === slotKey
          ? {
              ...item,
              transform: {
                scale:
                  transform.scale !== undefined
                    ? Math.min(2.5, Math.max(0.3, Number(transform.scale.toFixed(2))))
                    : item.transform.scale,
                rotation:
                  transform.rotation !== undefined
                    ? Math.min(180, Math.max(-180, Math.round(transform.rotation)))
                    : item.transform.rotation,
              },
            }
          : item,
      ),
    })),
  updatePhotoTransform: (slotKey, patch) =>
    set((state) => {
      const cur = state.photoTransforms[slotKey] ?? getDefaultPhotoTransformForSlot(slotKey);
      const next: PhotoItemTransform = {
        cx: patch.cx !== undefined ? Math.min(0.95, Math.max(0.05, Number(patch.cx.toFixed(4)))) : cur.cx,
        cy: patch.cy !== undefined ? Math.min(0.95, Math.max(0.05, Number(patch.cy.toFixed(4)))) : cur.cy,
        scale:
          patch.scale !== undefined
            ? Math.min(2.5, Math.max(0.12, Number(patch.scale.toFixed(3))))
            : cur.scale,
        rotation:
          patch.rotation !== undefined
            ? Math.min(180, Math.max(-180, Math.round(patch.rotation)))
            : cur.rotation,
        flipX: patch.flipX !== undefined ? patch.flipX : cur.flipX,
        opacity:
          patch.opacity !== undefined
            ? Math.min(1, Math.max(0.25, Number(patch.opacity.toFixed(2))))
            : cur.opacity,
        zOffset:
          patch.zOffset !== undefined
            ? Math.min(10, Math.max(-10, Math.round(patch.zOffset)))
            : cur.zOffset,
      };
      return {
        photoTransforms: {
          ...state.photoTransforms,
          [slotKey]: next,
        },
      };
    }),
  resetPhotoTransform: (slotKey, garment) =>
    set((state) => ({
      photoTransforms: {
        ...state.photoTransforms,
        [slotKey]: computeAutoPhotoTransform(slotKey, garment, state.activePose),
      },
    })),
  recalculateAllPhotoTransforms: (garmentsById, poseOverride) =>
    set((state) => {
      const poseToUse = poseOverride !== undefined ? poseOverride : state.activePose;
      const nextTransforms: Partial<Record<SlotKey, PhotoItemTransform>> = {};
      for (const item of state.items) {
        const garment = garmentsById.get(item.garmentId);
        nextTransforms[item.slotKey] = computeAutoPhotoTransform(item.slotKey, garment, poseToUse);
      }
      return {
        activePose: poseToUse,
        photoTransforms: nextTransforms,
      };
    }),
  bumpPhotoLayer: (slotKey, delta) =>
    set((state) => {
      const cur = state.photoTransforms[slotKey] ?? getDefaultPhotoTransformForSlot(slotKey);
      return {
        photoTransforms: {
          ...state.photoTransforms,
          [slotKey]: {
            ...cur,
            zOffset: Math.min(10, Math.max(-10, cur.zOffset + delta)),
          },
        },
      };
    }),
  loadItems: (items) =>
    set((state) => {
      const photoTransforms: Partial<Record<SlotKey, PhotoItemTransform>> = {};
      for (const item of items) {
        photoTransforms[item.slotKey] = item.photoTransform
          ? {
              cx: item.photoTransform.cx,
              cy: item.photoTransform.cy,
              scale: item.photoTransform.scale,
              rotation: item.photoTransform.rotation,
              flipX: item.photoTransform.flipX,
              opacity: 1,
              zOffset: 0,
            }
          : computeAutoPhotoTransform(item.slotKey, undefined, state.activePose);
      }
      return {
        items,
        selectedSlotKey: items[0]?.slotKey ?? null,
        photoTransforms,
      };
    }),
  loadPhotoLook: (items, photoTransforms) =>
    set({
      items,
      selectedSlotKey: items[0]?.slotKey ?? null,
      photoTransforms: { ...photoTransforms },
    }),
  clearDraft: () => set({ items: [], selectedSlotKey: null, photoTransforms: {} }),
}));
