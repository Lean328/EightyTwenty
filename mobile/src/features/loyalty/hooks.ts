import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { config } from '@/constants/config';
import { queryKeys, useRepositories } from '@/repositories';
import { AppError } from '@/services/errors';
import { walletPassService } from '@/services/integrations/wallet';
import type { LoyaltyCard } from '@/types';

export function useLoyaltyCard() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.loyaltyCard, queryFn: () => repos.loyalty.getCard() });
}

/** Paginated stamp history (Recent + full History). */
export function useLoyaltyActivity() {
  const repos = useRepositories();
  return useInfiniteQuery({
    queryKey: queryKeys.loyaltyActivity,
    queryFn: ({ pageParam }) => repos.loyalty.getActivity({ cursor: pageParam, limit: 20 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** "Add" in the Wallet sheet — mock marks the pass as added (see services/integrations/wallet.ts). */
export function useAddWalletPass() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const url = await repos.loyalty.getWalletPassUrl();
      const result = await walletPassService.addPass(url);
      if (result !== 'added') throw new AppError('NOT_IMPLEMENTED', 'Wallet passes aren’t available yet.');
      return repos.loyalty.markWalletPassAdded();
    },
    onSuccess: (card) => qc.setQueryData<LoyaltyCard>(queryKeys.loyaltyCard, card),
  });
}

/** Show "Apple Wallet": iPhone only, when the server issues passes (or the prototype's mock). */
export function showWalletFor(card: LoyaltyCard | undefined): boolean {
  return walletPassService.isSupported() && (config.features.walletPasses || !!card?.walletPassAvailable);
}
