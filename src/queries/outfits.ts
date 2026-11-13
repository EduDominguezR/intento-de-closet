import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteOutfitAndPreview,
  fetchUserOutfits,
  getOutfitById,
} from '@/src/firebase/firestore';

export const outfitKeys = {
  all: ['outfits'] as const,
  list: (uid: string) => ['outfits', 'list', uid] as const,
  detail: (outfitId: string) => ['outfits', 'detail', outfitId] as const,
};

export function useOutfitsQuery(uid: string | undefined) {
  return useQuery({
    queryKey: outfitKeys.list(uid ?? ''),
    queryFn: () => fetchUserOutfits(uid!),
    enabled: Boolean(uid),
    staleTime: 60 * 1000, // 1 min (sección 12)
  });
}

export function useOutfitQuery(outfitId: string | undefined) {
  return useQuery({
    queryKey: outfitKeys.detail(outfitId ?? ''),
    queryFn: () => getOutfitById(outfitId!),
    enabled: Boolean(outfitId),
    staleTime: 60 * 1000,
  });
}

export function useDeleteOutfitMutation(uid: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ outfitId, previewPath }: { outfitId: string; previewPath?: string }) =>
      deleteOutfitAndPreview(outfitId, previewPath),
    onSuccess: (_data, variables) => {
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: outfitKeys.list(uid) });
      }
      queryClient.removeQueries({ queryKey: outfitKeys.detail(variables.outfitId) });
    },
  });
}
