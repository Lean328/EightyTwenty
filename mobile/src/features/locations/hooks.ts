import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { isComingSoon, locationStatus, type LocationStatus } from '@/domain/hours';
import { useNow } from '@/hooks/useNow';
import { usePreferences } from '@/features/profile/hooks';
import { queryKeys, useRepositories } from '@/repositories';
import { geo, nearestFirst } from '@/services/integrations/geo';
import { useCartStore } from '@/store/cart';
import { showToast } from '@/store/ui';
import { colors } from '@/theme';
import type { CustomerPreferences, Location } from '@/types';

export function useLocations() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.locations, queryFn: () => repos.locations.getLocations(), staleTime: 10 * 60_000 });
}

/**
 * Cafés nearest first when "Use my location" is on and the phone allows it; otherwise the
 * usual order. `here` is null until a position is known.
 */
export function useCafesByDistance() {
  const result = useLocations();
  const { data: prefs } = usePreferences();
  const on = !!prefs?.security.useLocation;
  const position = useQuery({ queryKey: ['device-position'], queryFn: () => geo.position(), enabled: on, staleTime: 5 * 60_000, retry: false });
  const here = on ? (position.data ?? null) : null;
  const locations = useMemo(() => nearestFirst(result.data ?? [], here), [result.data, here]);
  return { ...result, locations, here };
}

export function useLocation(id: string | undefined) {
  const { data, ...rest } = useLocations();
  return { ...rest, data: id ? data?.find((l) => l.id === id) : undefined };
}

/** The café the customer is ordering from (also their "home café"). */
export function useSelectedLocation(): Location | undefined {
  const id = useCartStore((s) => s.context.locationId);
  return useLocation(id).data;
}

/** Open/closed label that refreshes every minute. */
export function useLocationStatus(location: Location | undefined): LocationStatus {
  const now = useNow();
  return location ? locationStatus(location, now) : { tone: 'closed', label: '', open: false };
}

export const STATUS_COLORS = { open: colors.success, closed: colors.danger, soon: colors.textMuted } as const;
export const STATUS_DOTS = { open: colors.success, closed: colors.danger, soon: colors.textFaint } as const;

/**
 * Choosing a café (picker, café detail "Order here"): updates the ordering context,
 * persists it as the home café, and flashes "Ordering from …" like the prototype.
 */
export function useChooseCafe() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const setLocation = useCartStore((s) => s.setLocation);
  const save = useMutation({
    mutationFn: (homeCafeId: string) => repos.preferences.updatePreferences({ homeCafeId }),
    onSuccess: (prefs) => qc.setQueryData<CustomerPreferences>(queryKeys.preferences, prefs),
  });
  return useCallback(
    (location: Location, options: { silent?: boolean; resetMethod?: boolean } = {}) => {
      if (isComingSoon(location)) return false;
      const changed = useCartStore.getState().context.locationId !== location.id;
      setLocation(location.id, location.methods);
      // "Order here" on a café page starts from that café's first service (prototype orderFromSel).
      if (options.resetMethod && location.methods[0]) useCartStore.getState().setMethod(location.methods[0]);
      save.mutate(location.id);
      if (changed && !options.silent) showToast('Ordering from ' + location.name);
      return true;
    },
    [setLocation, save],
  );
}
