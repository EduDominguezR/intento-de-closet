import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/src/stores/useAuthStore';

interface ProtectedRouteProps {
  requireAvatar?: boolean;
}

export function ProtectedRoute({ requireAvatar = true }: ProtectedRouteProps) {
  const { user, profile, initialized, loading } = useAuthStore();
  const location = useLocation();

  if (!initialized || loading) {
    return (
      <div
        className="min-h-screen bg-[#FFFBFD] flex items-center justify-center p-6"
        role="status"
        aria-live="polite"
      >
        <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-soft border border-[#E6E0F8] text-center space-y-4">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-[#E6E0F8] border-t-[#6E61BE] animate-spin" />
          <p className="text-sm font-medium text-[#6B6580]">Cargando tu closet...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const hasAvatar = Boolean(profile?.avatarConfig);
  if (requireAvatar && !hasAvatar && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
