import { lazy, Suspense, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OfflineQueueSync } from '@/src/components/capture/OfflineQueueSync';
import { AppShell } from '@/src/components/layout/AppShell';
import { ProtectedRoute } from '@/src/components/layout/ProtectedRoute';
import { consumeGoogleRedirectResult } from '@/src/firebase/auth';
import { auth } from '@/src/firebase/config';
import { ensureUserProfile } from '@/src/firebase/firestore';
import { useAuthStore } from '@/src/stores/useAuthStore';

const LoginPage = lazy(() =>
  import('@/src/pages/LoginPage').then((m) => ({ default: m.LoginPage })),
);
const OnboardingAvatarPage = lazy(() =>
  import('@/src/pages/OnboardingAvatarPage').then((m) => ({ default: m.OnboardingAvatarPage })),
);
const ClosetPage = lazy(() =>
  import('@/src/pages/ClosetPage').then((m) => ({ default: m.ClosetPage })),
);
const NewGarmentPage = lazy(() =>
  import('@/src/pages/NewGarmentPage').then((m) => ({ default: m.NewGarmentPage })),
);
const GarmentDetailPage = lazy(() =>
  import('@/src/pages/GarmentDetailPage').then((m) => ({ default: m.GarmentDetailPage })),
);
const NewOutfitPage = lazy(() =>
  import('@/src/pages/NewOutfitPage').then((m) => ({ default: m.NewOutfitPage })),
);
const OutfitsPage = lazy(() =>
  import('@/src/pages/OutfitsPage').then((m) => ({ default: m.OutfitsPage })),
);
const OutfitDetailPage = lazy(() =>
  import('@/src/pages/OutfitDetailPage').then((m) => ({ default: m.OutfitDetailPage })),
);
const LookbookPage = lazy(() =>
  import('@/src/pages/LookbookPage').then((m) => ({ default: m.LookbookPage })),
);
const LookbookEntryPage = lazy(() =>
  import('@/src/pages/LookbookEntryPage').then((m) => ({ default: m.LookbookEntryPage })),
);
const ProfilePage = lazy(() =>
  import('@/src/pages/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function RouteFallback() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6" role="status">
      <div className="h-8 w-8 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
    </div>
  );
}

function AuthInitializer() {
  const { setUser, setProfile, setInitialized, setLoading } = useAuthStore();

  useEffect(() => {
    void consumeGoogleRedirectResult().catch((error) => {
      console.warn('No se pudo procesar el resultado de redirección de Google:', error);
    });

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          const userProfile = await ensureUserProfile(firebaseUser);
          setProfile(userProfile);
        } catch (error) {
          console.error('Error cargando perfil de usuario:', error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }

      setInitialized(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [setInitialized, setLoading, setProfile, setUser]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer />
        <OfflineQueueSync />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute requireAvatar={false} />}>
              <Route path="/onboarding" element={<OnboardingAvatarPage />} />
            </Route>

            <Route element={<ProtectedRoute requireAvatar />}>
              <Route element={<AppShell />}>
                <Route path="/closet" element={<ClosetPage />} />
                <Route path="/garments/new" element={<NewGarmentPage />} />
                <Route path="/garments/:id" element={<GarmentDetailPage />} />
                <Route path="/outfits/new" element={<NewOutfitPage />} />
                <Route path="/outfits" element={<OutfitsPage />} />
                <Route path="/outfits/:id" element={<OutfitDetailPage />} />
                <Route path="/lookbook" element={<LookbookPage />} />
                <Route path="/lookbook/:id" element={<LookbookEntryPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/closet" replace />} />
            <Route path="*" element={<Navigate to="/closet" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
