import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useRepositories } from '@/repositories';
import { paymentProvider, type DemoCardInput } from '@/services/integrations/payments';
import type { CustomerPreferences, CustomerUpdate, ID, SavedAddress } from '@/types';

export function useProfile() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => repos.customer.getProfile() });
}

export function useUpdateProfile() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (update: CustomerUpdate) => repos.customer.updateProfile(update),
    onSuccess: (profile) => qc.setQueryData(queryKeys.profile, profile),
  });
}

export function usePreferences() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.preferences, queryFn: () => repos.preferences.getPreferences() });
}

/** Optimistic preference updates (toggles feel instant, like the prototype). */
export function useUpdatePreferences() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CustomerPreferences>) => repos.preferences.updatePreferences(patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: queryKeys.preferences });
      const prev = qc.getQueryData<CustomerPreferences>(queryKeys.preferences);
      if (prev) qc.setQueryData(queryKeys.preferences, { ...prev, ...patch });
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(queryKeys.preferences, ctx.prev),
    onSuccess: (prefs) => qc.setQueryData(queryKeys.preferences, prefs),
  });
}

export function useFavourites() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.favourites, queryFn: () => repos.preferences.getFavourites() });
}

export function useToggleFavourite() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, favourite }: { itemId: ID; favourite: boolean }) => repos.preferences.setFavourite(itemId, favourite),
    onMutate: ({ itemId, favourite }) => {
      const prev = qc.getQueryData<ID[]>(queryKeys.favourites) ?? [];
      qc.setQueryData(queryKeys.favourites, favourite ? [...prev.filter((x) => x !== itemId), itemId] : prev.filter((x) => x !== itemId));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(queryKeys.favourites, ctx.prev),
    onSuccess: (ids) => qc.setQueryData(queryKeys.favourites, ids),
  });
}

export function useAddresses() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.addresses, queryFn: () => repos.preferences.getAddresses() });
}

export function useAddAddress() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (address: Omit<SavedAddress, 'id'>) => repos.preferences.addAddress(address),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses }),
  });
}

export function useRemoveAddress() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repos.preferences.removeAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses }),
  });
}

export function usePaymentMethods() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.paymentMethods, queryFn: () => repos.payments.getPaymentMethods() });
}

/** Tokenise via the payment provider (demo) then save the token server-side. */
export function useAddCard() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: DemoCardInput) => repos.payments.addCard(await paymentProvider.tokenizeCard(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.paymentMethods }),
  });
}

export function useRemoveCard() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: ID) => repos.payments.removePaymentMethod(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.paymentMethods }),
  });
}

export function useFaqs() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.faqs, queryFn: () => repos.content.getFaqs(), staleTime: 60 * 60_000 });
}
