import type { User } from 'firebase/auth';
import { create } from 'zustand';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import type { UserProfile } from '@/src/types/models';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  initialized: boolean;
  loading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setAvatarConfig: (avatarConfig: AvatarConfig) => void;
  setInitialized: (initialized: boolean) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  initialized: false,
  loading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAvatarConfig: (avatarConfig) =>
    set((state) => ({
      profile: state.profile ? { ...state.profile, avatarConfig } : null,
    })),
  setInitialized: (initialized) => set({ initialized }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ user: null, profile: null, initialized: true, loading: false }),
}));
