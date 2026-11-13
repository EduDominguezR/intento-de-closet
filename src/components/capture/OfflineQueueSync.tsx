import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { flushOfflineGarments } from '@/src/lib/offline-queue';
import { garmentKeys } from '@/src/queries/garments';
import { useAuthStore } from '@/src/stores/useAuthStore';

export function OfflineQueueSync() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const runSync = async () => {
      const synced = await flushOfflineGarments(user.uid);
      if (synced > 0) {
        await queryClient.invalidateQueries({ queryKey: garmentKeys.list(user.uid) });
      }
    };

    void runSync();
    window.addEventListener('online', runSync);
    return () => window.removeEventListener('online', runSync);
  }, [queryClient, user]);

  return null;
}
