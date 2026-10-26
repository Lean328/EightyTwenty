import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys, useRepositories } from '@/repositories';
import { useCartStore } from '@/store/cart';
import type { MenuItem } from '@/types';

export function useCategories() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.categories, queryFn: () => repos.menu.getCategories(), staleTime: 30 * 60_000 });
}

/** Menu for the café currently selected for ordering. */
export function useMenu(locationId?: string) {
  const repos = useRepositories();
  const selected = useCartStore((s) => s.context.locationId);
  const id = locationId ?? selected;
  return useQuery({ queryKey: queryKeys.menu(id), queryFn: () => repos.menu.getMenuItems(id), staleTime: 10 * 60_000 });
}

/** Lookup helper over the loaded menu. */
export function useMenuIndex(): Map<string, MenuItem> {
  const { data } = useMenu();
  return useMemo(() => new Map((data ?? []).map((m) => [m.id, m])), [data]);
}
