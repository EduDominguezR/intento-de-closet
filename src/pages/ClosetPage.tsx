import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CloudUpload, Plus, RefreshCw, Shirt, Sparkles } from 'lucide-react';
import { ClosetFilters } from '@/src/components/closet/ClosetFilters';
import { ClosetSkeleton } from '@/src/components/closet/ClosetSkeleton';
import { GarmentCard } from '@/src/components/closet/GarmentCard';
import { classifyHexColorFamily } from '@/src/lib/closet/constants';
import { getPendingOfflineGarments } from '@/src/lib/offline-queue';
import { useGarmentsQuery } from '@/src/queries/garments';
import { useAuthStore } from '@/src/stores/useAuthStore';
import { useClosetStore } from '@/src/stores/useClosetStore';

export function ClosetPage() {
  const { user, profile } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  const { data: garments = [], isLoading, isError, refetch } = useGarmentsQuery(user?.uid);

  const { search, category, colorFamily, season, occasion, tag, resetFilters } = useClosetStore();

  const statusBanner = useMemo(() => {
    if (searchParams.get('added') === '1') return 'Prenda agregada a tu closet.';
    if (searchParams.get('queued') === '1') {
      return 'Prenda guardada localmente. Se subirá automáticamente cuando recuperes conexión.';
    }
    if (searchParams.get('deleted') === '1') return 'Prenda eliminada correctamente.';
    return null;
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;
    void getPendingOfflineGarments(user.uid)
      .then((items) => setPendingOfflineCount(items.length))
      .catch(() => setPendingOfflineCount(0));
  }, [garments.length, user]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of garments) {
      for (const t of item.tags) {
        tagSet.add(t);
      }
    }
    return Array.from(tagSet).sort((a, b) => a.localeCompare(b));
  }, [garments]);

  const filteredGarments = useMemo(() => {
    const q = search.trim().toLowerCase();

    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false;
      if (colorFamily !== 'all' && classifyHexColorFamily(g.dominantColor) !== colorFamily) {
        return false;
      }
      if (season !== 'all' && !g.season.includes(season)) return false;
      if (occasion !== 'all' && !g.occasion.includes(occasion)) return false;
      if (tag !== 'all' && !g.tags.includes(tag)) return false;

      if (q) {
        const haystack = [g.name, g.brand ?? '', g.subcategory ?? '', ...g.tags]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [category, colorFamily, garments, occasion, search, season, tag]);

  return (
    <div className="space-y-5">
      {/* Encabezado compacto */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#4A4458]">
            Closet de {profile?.displayName ?? 'ti'}
          </h1>
          <p className="text-sm text-[#6B6580]">
            Explora tus prendas y combínalas por capas en el armador.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            to="/outfits/new"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#E6E0F8]/75 hover:bg-[#E6E0F8] text-[#4A4458] text-sm font-semibold transition-colors"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Armar outfit</span>
          </Link>
        </div>
      </section>

      {/* Notificaciones de acción o cola offline */}
      {statusBanner && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-[#D5F5E3]/75 border border-[#D5F5E3] px-4 py-3 text-sm text-[#4A4458] flex items-center justify-between gap-3"
        >
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-xs font-semibold text-[#4A4458] underline shrink-0"
          >
            Ocultar
          </button>
        </div>
      )}

      {pendingOfflineCount > 0 && (
        <div
          role="status"
          className="rounded-2xl bg-[#FFF9DB] border border-[#E6E0F8] px-4 py-3 text-sm text-[#4A4458] flex items-center gap-2.5"
        >
          <CloudUpload className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span className="tabular-nums">
            Tienes {pendingOfflineCount}{' '}
            {pendingOfflineCount === 1 ? 'prenda pendiente' : 'prendas pendientes'} por subir en
            cuanto haya conexión.
          </span>
        </div>
      )}

      {/* Filtros en cliente */}
      {!isLoading && !isError && garments.length > 0 && (
        <ClosetFilters
          availableTags={availableTags}
          totalCount={garments.length}
          filteredCount={filteredGarments.length}
        />
      )}

      {/* Estados de carga, error, vacío o grid */}
      {isLoading ? (
        <ClosetSkeleton />
      ) : isError ? (
        <section
          role="alert"
          className="rounded-3xl bg-white border border-[#FADADD] p-8 text-center space-y-4"
        >
          <div className="mx-auto w-12 h-12 rounded-2xl bg-[#FADADD]/60 flex items-center justify-center text-[#4A4458]">
            <AlertCircle className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg font-semibold text-[#4A4458]">
              No pudimos cargar tu closet
            </h2>
            <p className="text-sm text-[#6B6580]">
              Revisa tu conexión o vuelve a intentarlo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            <span>Reintentar</span>
          </button>
        </section>
      ) : garments.length === 0 ? (
        <section className="rounded-3xl bg-white border border-[#E6E0F8] p-8 sm:p-12 text-center space-y-4 shadow-soft">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#E6E0F8]/70 flex items-center justify-center text-[#5E51AE]">
            <Shirt className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h2 className="font-display text-xl font-bold text-[#4A4458]">
              Tu closet digital está vacío
            </h2>
            <p className="text-sm text-[#6B6580] max-w-md mx-auto">
              Fotografía tu primera prenda para recortar el fondo automáticamente y empezar a
              combinar outfits.
            </p>
          </div>
          <Link
            to="/garments/new"
            className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Agregar mi primera prenda</span>
          </Link>
        </section>
      ) : filteredGarments.length === 0 ? (
        <section className="rounded-3xl bg-white border border-[#E6E0F8] p-8 text-center space-y-3">
          <h2 className="font-display text-lg font-semibold text-[#4A4458]">
            Ninguna prenda coincide con los filtros
          </h2>
          <p className="text-sm text-[#6B6580]">
            Prueba cambiando la búsqueda o restableciendo los filtros activos.
          </p>
          <button
            type="button"
            onClick={resetFilters}
            className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#E6E0F8] hover:bg-[#E6E0F8]/80 text-[#4A4458] text-sm font-semibold transition-colors"
          >
            Limpiar filtros
          </button>
        </section>
      ) : (
        <section aria-label="Prendas de tu closet">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredGarments.map((garment) => (
              <GarmentCard key={garment.id} garment={garment} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
