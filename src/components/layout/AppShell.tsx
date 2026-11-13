import { BookmarkCheck, Camera, Plus, Shirt, Sparkles, User } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { OfflineIndicator } from '@/src/components/pwa/OfflineIndicator';
import { PWAInstallButton } from '@/src/components/pwa/PWAInstallButton';

const NAV_ITEMS = [
  { to: '/closet', label: 'Mi Closet', shortLabel: 'Closet', icon: Shirt },
  { to: '/outfits/new', label: 'Armador', shortLabel: 'Armador', icon: Sparkles },
  { to: '/outfits', label: 'Mis Outfits', shortLabel: 'Outfits', icon: BookmarkCheck },
  { to: '/lookbook', label: 'Mi Lookbook', shortLabel: 'Lookbook', icon: Camera },
  { to: '/profile', label: 'Perfil', shortLabel: 'Perfil', icon: User },
] as const;

export function AppShell() {
  return (
    <div className="min-h-screen bg-[#FFFBFD] text-[#4A4458] flex flex-col">
      {/* Desktop & Mobile Compact Top Bar (Three-Zone Contract) */}
      <header className="sticky top-0 z-30 h-14 bg-[#FFFBFD]/90 backdrop-blur-md border-b border-[#E6E0F8]/80">
        <div className="max-w-6xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          <Link
            to="/closet"
            className="font-display text-lg font-bold tracking-tight text-[#4A4458] whitespace-nowrap shrink-0"
          >
            Closetly
          </Link>

          <nav
            aria-label="Navegación principal"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#6B6580]"
          >
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/outfits'}
                className={({ isActive }) =>
                  `whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    isActive
                      ? 'text-[#4A4458] font-semibold border-[#8B7FD4]'
                      : 'border-transparent hover:text-[#4A4458]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton variant="compact" />
            <Link
              to="/garments/new"
              className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Agregar prenda</span>
            </Link>
          </div>
        </div>
      </header>

      <OfflineIndicator />

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-24 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile Fixed Bottom Tab Bar (Thumb Zone) */}
      <nav
        aria-label="Navegación inferior"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#FFFBFD]/95 backdrop-blur-md border-t border-[#E6E0F8]"
      >
        <div className="grid grid-cols-5 h-full max-w-md mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/outfits'}
                className={({ isActive }) =>
                  `min-h-[44px] min-w-[44px] flex flex-col items-center justify-center gap-1 transition-colors ${
                    isActive ? 'text-[#5E51AE] font-semibold' : 'text-[#6B6580]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className="w-5 h-5"
                      strokeWidth={isActive ? 2.25 : 1.75}
                      aria-hidden="true"
                    />
                    <span className="text-[10px] leading-none whitespace-nowrap">
                      {item.shortLabel}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
