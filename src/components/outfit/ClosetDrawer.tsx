import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Plus, Search } from 'lucide-react';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { CATEGORY_SHORT_LABELS } from '@/src/lib/closet/constants';
import { resolveGarmentSlot } from '@/src/lib/outfit/slots';
import { useOutfitDraftStore } from '@/src/stores/useOutfitDraftStore';
import type { AvatarConfig } from '@/src/lib/avatar/types';
import type { Garment, GarmentCategory } from '@/src/types/models';

interface ClosetDrawerProps {
  garments: Garment[];
  avatarConfig: AvatarConfig;
  isLoading: boolean;
}

const CATEGORIES: { value: 'all' | GarmentCategory; label: string }[] = [
  { value: 'all', label: 'Todas' },
  ...(Object.keys(CATEGORY_SHORT_LABELS) as GarmentCategory[]).map((key) => ({
    value: key,
    label: CATEGORY_SHORT_LABELS[key],
  })),
];

export function ClosetDrawer({ garments, avatarConfig, isLoading }: ClosetDrawerProps) {
  const { items, applyGarment } = useOutfitDraftStore();
  const [category, setCategory] = useState<'all' | GarmentCategory>('all');
  const [search, setSearch] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeGarmentIds = useMemo(
    () => new Set(items.map((item) => item.garmentId)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return garments.filter((g) => {
      if (category !== 'all' && g.category !== category) return false;
      if (q && !`${g.name} ${g.brand ?? ''} ${g.tags.join(' ')}`.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [category, garments, search]);

  const drawerContent = (
    <div className="space-y-3.5">
      <div className="relative">
        <Search
          className="w-4 h-4 text-[#6B6580] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en mi closet..."
          aria-label="Buscar prendas para el outfit"
          className="w-full min-h-[40px] pl-9 pr-3 py-1.5 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-xs sm:text-sm text-[#4A4458]"
        />
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            type="button"
            onClick={() => setCategory(cat.value)}
            className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
              category === cat.value
                ? 'bg-[#6E61BE] text-white'
                : 'bg-[#E6E0F8]/50 text-[#4A4458] hover:bg-[#E6E0F8]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-square rounded-2xl bg-[#E6E0F8]/35 animate-pulse" />
          ))}
        </div>
      ) : garments.length === 0 ? (
        <div className="rounded-2xl bg-[#FFFBFD] border border-[#E6E0F8] p-5 text-center space-y-3">
          <p className="text-sm text-[#6B6580]">Aún no tienes prendas en tu closet.</p>
          <Link
            to="/garments/new"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 rounded-2xl bg-[#6E61BE] text-white text-xs font-semibold"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Agregar prenda</span>
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-[#6B6580] text-center py-6">
          No hay prendas con ese filtro.
        </p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
          {filtered.map((garment) => {
            const isWorn = activeGarmentIds.has(garment.id);
            const { slotKey } = resolveGarmentSlot(garment);
            return (
              <button
                key={garment.id}
                type="button"
                onClick={() => applyGarment(garment, avatarConfig)}
                aria-pressed={isWorn}
                aria-label={`Poner ${garment.name} en ${slotKey}`}
                className={`rounded-2xl p-2 border text-left transition-all flex flex-col gap-1.5 ${
                  isWorn
                    ? 'bg-[#E6E0F8]/65 border-[#6E61BE] shadow-sm'
                    : 'bg-[#FFFBFD] border-[#E6E0F8] hover:bg-[#E6E0F8]/30'
                }`}
              >
                <div className="aspect-square w-full rounded-xl bg-white p-1.5 overflow-hidden flex items-center justify-center">
                  <StorageImage
                    path={garment.imageThumbPath || garment.cutoutPath}
                    alt={`${garment.name} (${garment.category})`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <span className="text-[11px] font-semibold text-[#4A4458] truncate w-full">
                  {garment.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop lateral drawer */}
      <aside
        aria-label="Prendas disponibles del closet"
        className="hidden lg:block rounded-3xl bg-white p-5 border border-[#E6E0F8] shadow-soft space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-[#4A4458]">Tu closet</h2>
          <span className="text-xs text-[#6B6580] tabular-nums">
            {garments.length} prendas
          </span>
        </div>
        {drawerContent}
      </aside>

      {/* Mobile bottom expandable sheet */}
      <div className="lg:hidden">
        <div className="rounded-3xl bg-white border border-[#E6E0F8] shadow-sheet overflow-hidden">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-expanded={mobileOpen}
            className="w-full min-h-[52px] px-5 py-3 flex items-center justify-between text-left bg-[#FFFBFD]"
          >
            <div>
              <p className="font-display text-sm font-bold text-[#4A4458]">
                Elegir prendas del closet
              </p>
              <p className="text-xs text-[#6B6580] tabular-nums">
                {items.length} puestas · {garments.length} disponibles
              </p>
            </div>
            {mobileOpen ? (
              <ChevronDown className="w-5 h-5 text-[#4A4458]" aria-hidden="true" />
            ) : (
              <ChevronUp className="w-5 h-5 text-[#4A4458]" aria-hidden="true" />
            )}
          </button>

          {mobileOpen && <div className="p-4 border-t border-[#E6E0F8]">{drawerContent}</div>}
        </div>
      </div>
    </>
  );
}
