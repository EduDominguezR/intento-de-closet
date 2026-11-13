import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '@/src/firebase/firestore';

export const profileKeys = {
  profile: (uid: string) => ['profile', uid] as const,
};

export function useUserProfileQuery(uid: string | undefined) {
  return useQuery({
    queryKey: profileKeys.profile(uid ?? ''),
    queryFn: () => getUserProfile(uid!),
    enabled: Boolean(uid),
    staleTime: 5 * 60 * 1000,
  });
}
