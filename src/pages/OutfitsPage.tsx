import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookmarkCheck, Plus, Sparkles } from 'lucide-react';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { useOutfitsQuery } from '@/src/queries/outfits';
import { useAuthStore } from '@/src/stores/useAuthStore';
import type { OutfitCollection } from '@/src/types/models';

const COLLECTION_TABS: { value: 'all' | OutfitCollection; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'casual', label: 'Casual' },
  { value: 'work', label: 'Trabajo' },
  { value: 'party', label: 'Fiesta' },
  { value: 'travel', label: 'Viaje' },
  { value: 'custom', label: 'Custom' },
];

const COLLECTION_LABELS: Record<OutfitCollection, string> = {
  casual: 'Casual',
  work: 'Trabajo',
  party: 'Fiesta',
  travel: 'Viaje',
  custom: 'Custom',
};

export function OutfitsPage() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCollection, setActiveCollection] = useState<'all' | OutfitCollection>('all');

  const { data: outfits = [], isLoading, isError, refetch } = useOutfitsQuery(user?.uid);

  const bannerMsg = useMemo(() => {
    if (searchParams.get('saved') === '1') return 'Outfit guardado en tu colección.';
    if (searchParams.get('deleted') === '1') return 'Outfit eliminado.';
    return null;
  }, [searchParams]);

  const filteredOutfits = useMemo(() => {
    if (activeCollection === 'all') return outfits;
    return outfits.filter((o) => o.collection === activeCollection);
  }, [activeCollection, outfits]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#4A4458]">Mis outfits</h1>
          <p className="text-sm text-[#6B6580]">
            Tus combinaciones guardadas por ocasión y colección.
          </p>
        </div>

        <Link
          to="/outfits/new"
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>Nuevo outfit</span>
        </Link>
      </div>

      {bannerMsg && (
        <div
          role="status"
          className="rounded-2xl bg-[#D5F5E3]/75 border border-[#D5F5E3] px-4 py-3 text-sm text-[#4A4458] flex items-center justify-between gap-3"
        >
          <span>{bannerMsg}</span>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            className="text-xs font-semibold underline"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* Tabs de colección */}
      <div
        role="tablist"
        aria-label="Filtrar outfits por colección"
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {COLLECTION_TABS.map((tab) => {
          const active = activeCollection === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveCollection(tab.value)}
              className={`min-h-[40px] px-4 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#6E61BE] text-white'
                  : 'bg-[#E6E0F8]/55 text-[#4A4458] hover:bg-[#E6E0F8]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-white border border-[#E6E0F8] p-3 space-y-3 animate-pulse"
            >
              <div className="aspect-[3/4] rounded-xl bg-[#E6E0F8]/35" />
              <div className="h-4 w-2/3 rounded-lg bg-[#E6E0F8]/50" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="rounded-3xl bg-white border border-[#FADADD] p-8 text-center space-y-3">
          <p className="text-sm text-[#4A4458]">No pudimos cargar tus outfits.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] text-white text-sm font-semibold"
          >
            Reintentar
          </button>
        </div>
      ) : outfits.length === 0 ? (
        <section className="rounded-3xl bg-white border border-[#E6E0F8] p-8 sm:p-12 text-center space-y-4 shadow-soft">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-[#E6E0F8]/70 flex items-center justify-center text-[#5E51AE]">
            <BookmarkCheck className="w-7 h-7" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold text-[#4A4458]">
              Todavía no guardas ningún outfit
            </h2>
            <p className="text-sm text-[#6B6580] max-w-md mx-auto">
              Abre el armador para combinar prendas de tu closet sobre tu maniquí 2D y guarda tu
              primer look.
            </p>
          </div>
          <Link
            to="/outfits/new"
            className="inline-flex items-center gap-2 min-h-[48px] px-6 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold"
          >
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            <span>Ir al armador</span>
          </Link>
        </section>
      ) : filteredOutfits.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#E6E0F8] p-8 text-center space-y-2">
          <p className="font-display text-base font-semibold text-[#4A4458]">
            Sin outfits en esta colección
          </p>
          <p className="text-sm text-[#6B6580]">
            Cambia de pestaña o crea uno nuevo para esta colección.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredOutfits.map((outfit) => (
            <Link
              key={outfit.id}
              to={`/outfits/${outfit.id}`}
              className="group rounded-2xl bg-white border border-[#E6E0F8] p-3 flex flex-col gap-3 shadow-soft transition-transform duration-150 hover:-translate-y-0.5"
            >
              <div className="aspect-[3/4] w-full rounded-xl bg-[#FFFBFD] border border-[#E6E0F8]/60 overflow-hidden flex items-center justify-center">
                {outfit.previewPath ? (
                  <StorageImage
                    path={outfit.previewPath}
                    alt={`${outfit.name} (${COLLECTION_LABELS[outfit.collection]})`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-[#6B6580] p-4 text-center">
                    {outfit.items.length} prendas
                  </div>
                )}
              </div>

              <div className="space-y-0.5 px-0.5">
                <h3 className="font-display text-sm font-semibold text-[#4A4458] truncate">
                  {outfit.name}
                </h3>
                <p className="text-xs text-[#6B6580] truncate tabular-nums">
                  {COLLECTION_LABELS[outfit.collection]} · {outfit.items.length}{' '}
                  {outfit.items.length === 1 ? 'prenda' : 'prendas'}
                  {outfit.occasion ? ` · ${outfit.occasion}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
