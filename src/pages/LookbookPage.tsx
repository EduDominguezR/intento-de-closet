import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { LookbookPhoto } from '@/src/components/lookbook/LookbookPhoto';
import { RegisterLookModal } from '@/src/components/lookbook/RegisterLookModal';
import { StorageImage } from '@/src/components/ui/StorageImage';
import { formatMonthYearDisplay, formatWornOnDisplay } from '@/src/lib/lookbook/image';
import { useLookbookQuery } from '@/src/queries/lookbook';
import { useOutfitsQuery } from '@/src/queries/outfits';
import { useAuthStore } from '@/src/stores/useAuthStore';
import type { LookbookEntry } from '@/src/types/models';

export function LookbookPage() {
  const { user, profile } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const outfitIdFilter = searchParams.get('outfitId') || '';

  const { data: entries = [], isLoading, isError, refetch } = useLookbookQuery(user?.uid);
  const { data: outfits = [] } = useOutfitsQuery(user?.uid);

  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [collapsedMonths, setCollapsedMonths] = useState<Record<string, boolean>>({});
  const [registerOpen, setRegisterOpen] = useState(false);

  const displayName = profile?.displayName || user?.displayName || 'ti';

  const existingOutfitIds = useMemo(() => new Set(outfits.map((o) => o.id)), [outfits]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    for (const entry of entries) {
      if (entry.wornOn.length >= 7) {
        months.add(entry.wornOn.slice(0, 7));
      }
    }
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (outfitIdFilter && entry.outfitId !== outfitIdFilter) return false;
      if (monthFilter !== 'all' && !entry.wornOn.startsWith(monthFilter)) return false;
      return true;
    });
  }, [entries, monthFilter, outfitIdFilter]);

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, LookbookEntry[]>();
    for (const entry of filteredEntries) {
      const ym = entry.wornOn.slice(0, 7) || 'otros';
      const list = groups.get(ym) ?? [];
      list.push(entry);
      groups.set(ym, list);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredEntries]);

  function toggleMonthSection(monthKey: string) {
    setCollapsedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#4A4458]">Mi Lookbook</h1>
          <p className="text-sm text-[#6B6580]">
            Registro privado de tus outfits reales usados por fecha.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {outfitIdFilter && (
            <button
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-[#E6E0F8]/70 hover:bg-[#E6E0F8] text-xs font-semibold text-[#4A4458]"
            >
              Ver todos los outfits
            </button>
          )}

          {monthOptions.length > 0 && (
            <select
              aria-label="Filtrar lookbook por mes y año"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="min-h-[44px] px-3.5 py-2 rounded-2xl border border-[#E6E0F8] bg-white text-sm font-medium text-[#4A4458]"
            >
              <option value="all">Todos los meses</option>
              {monthOptions.map((ym) => (
                <option key={ym} value={ym}>
                  {formatMonthYearDisplay(ym)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-3xl bg-[#E6E0F8]/35 animate-pulse border border-[#E6E0F8]"
            />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-3xl bg-white p-8 border border-[#E6E0F8] text-center space-y-3">
          <p className="text-sm text-[#4A4458]">No pudimos cargar tu lookbook.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="min-h-[44px] px-5 py-2 rounded-2xl bg-[#6E61BE] text-white text-sm font-semibold"
          >
            Reintentar
          </button>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-3xl bg-white p-8 sm:p-12 border border-[#E6E0F8] shadow-soft text-center space-y-4">
          <p className="font-display text-lg font-semibold text-[#4A4458]">
            {entries.length === 0
              ? 'Aún no has registrado ningún look. Cuando uses un outfit, súbelo aquí.'
              : 'No hay looks registrados con el filtro seleccionado.'}
          </p>
          <button
            type="button"
            onClick={() => setRegisterOpen(true)}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Registrar look</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByMonth.map(([monthKey, monthEntries]) => {
            const isCollapsed = Boolean(collapsedMonths[monthKey]);
            return (
              <section key={monthKey} className="space-y-3">
                <button
                  type="button"
                  onClick={() => toggleMonthSection(monthKey)}
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-2 text-left min-h-[40px] group"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-[#6B6580]" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#6B6580]" aria-hidden="true" />
                  )}
                  <h2 className="font-display text-base font-bold text-[#4A4458] group-hover:text-[#5E51AE] transition-colors">
                    {formatMonthYearDisplay(monthKey)}
                  </h2>
                  <span className="text-xs font-medium text-[#6B6580] tabular-nums">
                    ({monthEntries.length})
                  </span>
                </button>

                {!isCollapsed && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {monthEntries.map((entry) => {
                      const readableDate = formatWornOnDisplay(entry.wornOn);
                      const isOrphanOutfit = !existingOutfitIds.has(entry.outfitId);
                      const altText = `Foto de ${displayName} usando el outfit ${entry.outfitSnapshot.name} el ${readableDate}`;

                      return (
                        <Link
                          key={entry.id}
                          to={`/lookbook/${entry.id}`}
                          className="group rounded-3xl bg-white border border-[#E6E0F8] shadow-soft overflow-hidden flex flex-col hover:border-[#8B7FD4] transition-colors"
                        >
                          <div className="relative aspect-[3/4] w-full bg-[#FFFBFD] overflow-hidden">
                            <LookbookPhoto
                              path={entry.photoThumbPath}
                              alt={altText}
                              className="w-full h-full object-cover"
                            />

                            {/* Overlay pequeño digital vs real en la esquina */}
                            {entry.outfitSnapshot.previewPath && (
                              <div
                                className="absolute bottom-2.5 right-2.5 w-14 h-18 rounded-xl bg-white/95 border border-[#E6E0F8] p-1 shadow-sm overflow-hidden"
                                aria-hidden="true"
                              >
                                <StorageImage
                                  path={entry.outfitSnapshot.previewPath}
                                  alt={entry.outfitSnapshot.name}
                                  className="w-full h-full object-contain"
                                />
                              </div>
                            )}
                          </div>

                          <div className="p-3.5 space-y-1">
                            <p className="text-xs font-medium text-[#6B6580]">{readableDate}</p>
                            <h3 className="font-display text-sm font-semibold text-[#4A4458] truncate">
                              {entry.outfitSnapshot.name}
                            </h3>
                            {isOrphanOutfit && (
                              <p className="text-[11px] font-medium text-[#6B6580]">
                                Outfit eliminado
                              </p>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* Botón flotante "+ Registrar look" con margen sobre la barra inferior móvil */}
      <button
        type="button"
        onClick={() => setRegisterOpen(true)}
        className="fixed bottom-20 md:bottom-8 right-5 z-30 min-h-[48px] px-5 py-3 rounded-2xl bg-[#6E61BE] hover:bg-[#5E51AE] text-white text-sm font-semibold shadow-sheet inline-flex items-center gap-2 transition-colors"
      >
        <Plus className="w-4 h-4" aria-hidden="true" />
        <span>Registrar look</span>
      </button>

      <RegisterLookModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onSaved={() => setRegisterOpen(false)}
      />
    </div>
  );
}
