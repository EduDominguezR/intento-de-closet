import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteGarmentAndCleanupOutfits,
  fetchUserGarments,
  getGarmentById,
  updateGarment,
  type UpdateGarmentInput,
} from '@/src/firebase/firestore';
import type { GarmentStoragePaths } from '@/src/firebase/storage';
import { outfitKeys } from '@/src/queries/outfits';

export const garmentKeys = {
  all: ['garments'] as const,
  list: (uid: string) => ['garments', 'list', uid] as const,
  detail: (garmentId: string) => ['garments', 'detail', garmentId] as const,
};

export function useGarmentsQuery(uid: string | undefined) {
  return useQuery({
    queryKey: garmentKeys.list(uid ?? ''),
    queryFn: () => fetchUserGarments(uid!),
    enabled: Boolean(uid),
    staleTime: 5 * 60 * 1000, // 5 min (sección 5 y 12)
  });
}

export function useGarmentQuery(garmentId: string | undefined) {
  return useQuery({
    queryKey: garmentKeys.detail(garmentId ?? ''),
    queryFn: () => getGarmentById(garmentId!),
    enabled: Boolean(garmentId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateGarmentMutation(uid: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ garmentId, patch }: { garmentId: string; patch: UpdateGarmentInput }) =>
      updateGarment(garmentId, patch),
    onSuccess: (_data, variables) => {
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: garmentKeys.list(uid) });
      }
      void queryClient.invalidateQueries({ queryKey: garmentKeys.detail(variables.garmentId) });
    },
  });
}

export function useDeleteGarmentMutation(uid: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      garmentId,
      paths,
    }: {
      garmentId: string;
      paths: GarmentStoragePaths;
    }) => {
      if (!uid) throw new Error('Usuario no autenticado.');
      return deleteGarmentAndCleanupOutfits(uid, garmentId, paths);
    },
    onSuccess: (_data, variables) => {
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: garmentKeys.list(uid) });
        void queryClient.invalidateQueries({ queryKey: outfitKeys.list(uid) });
      }
      queryClient.removeQueries({ queryKey: garmentKeys.detail(variables.garmentId) });
    },
  });
}
