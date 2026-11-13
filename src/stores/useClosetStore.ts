import { create } from 'zustand';
import type { GarmentCategory } from '@/src/types/models';

export type CategoryFilter = 'all' | GarmentCategory;

interface ClosetFilterState {
  search: string;
  category: CategoryFilter;
  colorFamily: string; // 'all' | color family id
  season: string; // 'all' | season name
  occasion: string; // 'all' | occasion name
  tag: string; // 'all' | tag string
  filtersExpanded: boolean;
  setSearch: (search: string) => void;
  setCategory: (category: CategoryFilter) => void;
  setColorFamily: (colorFamily: string) => void;
  setSeason: (season: string) => void;
  setOccasion: (occasion: string) => void;
  setTag: (tag: string) => void;
  toggleFiltersExpanded: () => void;
  resetFilters: () => void;
}

export const useClosetStore = create<ClosetFilterState>((set) => ({
  search: '',
  category: 'all',
  colorFamily: 'all',
  season: 'all',
  occasion: 'all',
  tag: 'all',
  filtersExpanded: false,
  setSearch: (search) => set({ search }),
  setCategory: (category) => set({ category }),
  setColorFamily: (colorFamily) => set({ colorFamily }),
  setSeason: (season) => set({ season }),
  setOccasion: (occasion) => set({ occasion }),
  setTag: (tag) => set({ tag }),
  toggleFiltersExpanded: () => set((s) => ({ filtersExpanded: !s.filtersExpanded })),
  resetFilters: () =>
    set({
      search: '',
      category: 'all',
      colorFamily: 'all',
      season: 'all',
      occasion: 'all',
      tag: 'all',
    }),
}));
