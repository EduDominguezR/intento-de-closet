import { Search, SlidersHorizontal, X } from 'lucide-react';
import {
  CATEGORY_SHORT_LABELS,
  COLOR_FAMILIES,
  OCCASION_OPTIONS,
  SEASON_OPTIONS,
} from '@/src/lib/closet/constants';
import { useClosetStore, type CategoryFilter } from '@/src/stores/useClosetStore';
import type { GarmentCategory } from '@/src/types/models';

interface ClosetFiltersProps {
  availableTags: string[];
  totalCount: number;
  filteredCount: number;
}

const CATEGORIES: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  ...(Object.keys(CATEGORY_SHORT_LABELS) as GarmentCategory[]).map((key) => ({
    value: key,
    label: CATEGORY_SHORT_LABELS[key],
  })),
];

export function ClosetFilters({
  availableTags,
  totalCount,
  filteredCount,
}: ClosetFiltersProps) {
  const {
    search,
    category,
    colorFamily,
    season,
    occasion,
    tag,
    filtersExpanded,
    setSearch,
    setCategory,
    setColorFamily,
    setSeason,
    setOccasion,
    setTag,
    toggleFiltersExpanded,
    resetFilters,
  } = useClosetStore();

  const secondaryFilterCount =
    (colorFamily !== 'all' ? 1 : 0) +
    (season !== 'all' ? 1 : 0) +
    (occasion !== 'all' ? 1 : 0) +
    (tag !== 'all' ? 1 : 0);

  const hasAnyFilter =
    search.trim().length > 0 || category !== 'all' || secondaryFilterCount > 0;

  return (
    <section
      aria-label="Búsqueda y filtros del closet"
      className="md:sticky md:top-14 z-20 rounded-3xl bg-white/95 backdrop-blur-md p-4 sm:p-5 shadow-soft border border-[#E6E0F8] space-y-3.5"
    >
      {/* Fila superior: buscador + botón filtros */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-[#6B6580] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar prenda, marca o etiqueta..."
            aria-label="Buscar prendas en tu closet"
            className="w-full min-h-[44px] pl-10 pr-9 py-2 rounded-2xl border border-[#E6E0F8] bg-[#FFFBFD] text-sm text-[#4A4458] placeholder:text-[#6B6580]/75"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center text-[#6B6580] hover:text-[#4A4458]"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={toggleFiltersExpanded}
          aria-expanded={filtersExpanded}
          className={`min-h-[44px] px-3.5 py-2 rounded-2xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
            filtersExpanded || secondaryFilterCount > 0
              ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
              : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458] hover:bg-[#E6E0F8]/40'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          <span>
            Filtros{secondaryFilterCount > 0 ? ` (${secondaryFilterCount})` : ''}
          </span>
        </button>
      </div>

      {/* Categorías */}
      <div
        role="tablist"
        aria-label="Filtrar por categoría"
        className="flex items-center gap-1.5 overflow-x-auto pb-1"
      >
        {CATEGORIES.map((item) => {
          const active = category === item.value;
          return (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCategory(item.value)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-2xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                active
                  ? 'bg-[#6E61BE] text-white'
                  : 'bg-[#E6E0F8]/40 text-[#4A4458] hover:bg-[#E6E0F8]/75'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Panel secundario desplegable: Color, Temporada, Ocasión, Etiquetas */}
      {filtersExpanded && (
        <div className="pt-3 border-t border-[#E6E0F8] space-y-4">
          <div>
            <span className="block text-xs font-semibold text-[#6B6580] mb-2">Color</span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setColorFamily('all')}
                className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border transition-colors ${
                  colorFamily === 'all'
                    ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
                    : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#6B6580]'
                }`}
              >
                Todos
              </button>
              {COLOR_FAMILIES.map((col) => {
                const active = colorFamily === col.id;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => setColorFamily(active ? 'all' : col.id)}
                    aria-pressed={active}
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold border inline-flex items-center gap-2 transition-colors ${
                      active
                        ? 'bg-[#E6E0F8] border-[#8B7FD4] text-[#4A4458]'
                        : 'bg-[#FFFBFD] border-[#E6E0F8] text-[#4A4458]'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-[#4A4458]/20 shrink-0"
                      style={{ backgroundColor: col.hex }}
                      aria-hidden="true"
                    />
                    <span>{col.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="filter-season" className="block text-xs font-semibold text-[#6B6580] mb-1">
                Temporada
              </label>
              <select
                id="filter-season"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-[#E6E0F8] bg-[#FFFBFD] text-xs font-semibold text-[#4A4458]"
              >
                <option value="all">Todas las temporadas</option>
                {SEASON_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-occasion" className="block text-xs font-semibold text-[#6B6580] mb-1">
                Ocasión
              </label>
              <select
                id="filter-occasion"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-[#E6E0F8] bg-[#FFFBFD] text-xs font-semibold text-[#4A4458]"
              >
                <option value="all">Todas las ocasiones</option>
                {OCCASION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-tag" className="block text-xs font-semibold text-[#6B6580] mb-1">
                Etiqueta
              </label>
              <select
                id="filter-tag"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full min-h-[40px] px-3 rounded-xl border border-[#E6E0F8] bg-[#FFFBFD] text-xs font-semibold text-[#4A4458]"
              >
                <option value="all">Todas las etiquetas</option>
                {availableTags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Resumen de conteo y limpiar filtros */}
      <div className="flex items-center justify-between text-xs text-[#6B6580] pt-1">
        <span className="tabular-nums">
          Mostrando {filteredCount} de {totalCount} {totalCount === 1 ? 'prenda' : 'prendas'}
        </span>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={resetFilters}
            className="font-semibold text-[#5E51AE] hover:underline py-1"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </section>
  );
}
