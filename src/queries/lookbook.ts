import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteLookbookEntryRecord,
  fetchUserLookbookEntries,
  getLookbookEntryById,
  updateLookbookEntryNote,
} from '@/src/firebase/firestore';
import { deleteLookbookAssets, getStorageBlob } from '@/src/firebase/storage';

export const lookbookKeys = {
  all: ['lookbook'] as const,
  list: (uid: string) => ['lookbook', 'list', uid] as const,
  detail: (entryId: string) => ['lookbook', 'detail', entryId] as const,
  photo: (path: string) => ['lookbook-photo', path] as const,
};

export function useLookbookQuery(uid: string | undefined) {
  return useQuery({
    queryKey: lookbookKeys.list(uid ?? ''),
    queryFn: () => fetchUserLookbookEntries(uid!),
    enabled: Boolean(uid),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useLookbookEntryQuery(entryId: string | undefined) {
  return useQuery({
    queryKey: lookbookKeys.detail(entryId ?? ''),
    queryFn: () => getLookbookEntryById(entryId!),
    enabled: Boolean(entryId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Descarga la foto privada del lookbook exclusivamente vía Firebase Storage getBlob()
 * (nunca getDownloadURL) y administra el ciclo de vida del objectURL por montaje.
 */
export function useLookbookPhotoBlob(path: string | undefined) {
  const queryResult = useQuery({
    queryKey: lookbookKeys.photo(path ?? ''),
    queryFn: () => getStorageBlob(path!),
    enabled: Boolean(path),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });

  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!queryResult.data) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(queryResult.data);
    setObjectUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [queryResult.data]);

  return {
    objectUrl,
    isLoading: queryResult.isLoading || (Boolean(queryResult.data) && !objectUrl),
    isError: queryResult.isError,
  };
}

export function useUpdateLookbookNoteMutation(uid: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entryId, note }: { entryId: string; note: string }) =>
      updateLookbookEntryNote(entryId, note),
    onSuccess: async (_data, variables) => {
      if (uid) {
        await queryClient.invalidateQueries({ queryKey: lookbookKeys.list(uid) });
      }
      await queryClient.invalidateQueries({ queryKey: lookbookKeys.detail(variables.entryId) });
    },
  });
}

/**
 * Elimina PRIMERO los dos archivos WebP de Storage (full + thumb) y SOLO si
 * ambos se borran sin error procede a borrar el documento en Firestore.
 */
export function useDeleteLookbookEntryMutation(uid: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      entryId: string;
      photoPath: string;
      photoThumbPath: string;
    }) => {
      await deleteLookbookAssets({
        photoPath: input.photoPath,
        photoThumbPath: input.photoThumbPath,
      });
      await deleteLookbookEntryRecord(input.entryId);
    },
    onSuccess: async (_data, variables) => {
      if (uid) {
        await queryClient.invalidateQueries({ queryKey: lookbookKeys.list(uid) });
      }
      queryClient.removeQueries({ queryKey: lookbookKeys.detail(variables.entryId) });
      queryClient.removeQueries({ queryKey: lookbookKeys.photo(variables.photoPath) });
      queryClient.removeQueries({ queryKey: lookbookKeys.photo(variables.photoThumbPath) });
    },
  });
}
