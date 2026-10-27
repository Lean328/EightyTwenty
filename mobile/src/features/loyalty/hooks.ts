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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * "Add" in the Wallet sheet. Mock: marks the pass as added. Real pass: opens the server's
 * "add to Wallet" page (services/integrations/wallet.ts) and, once it closes, reads the card
 * back — the iPhone registers the pass with the server when the customer taps Add, which is
 * what sets `walletPassAdded`. `returnTo` is the screen to come back to.
 */
export function useAddWalletPass() {
  const repos = useRepositories();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnTo: string) => {
      const url = await repos.loyalty.getWalletPassUrl(walletPassService.returnUrl(returnTo));
      const result = await walletPassService.addPass(url);
      if (result === 'unavailable') throw new AppError('NOT_IMPLEMENTED', 'Wallet passes aren’t available yet.');
      if (result === 'added') return repos.loyalty.markWalletPassAdded();
      let card = await repos.loyalty.getCard();
      for (let tries = 0; !card.walletPassAdded && tries < 3; tries++) {
        await wait(800);
        card = await repos.loyalty.getCard();
      }
      return card;
    },
    onSuccess: (card) => qc.setQueryData<LoyaltyCard>(queryKeys.loyaltyCard, card),
  });
}

/** Show "Apple Wallet": iPhone only, when the server issues passes (or the prototype's mock). */
export function showWalletFor(card: LoyaltyCard | undefined): boolean {
  return walletPassService.isSupported() && (config.features.walletPasses || !!card?.walletPassAvailable);
}
