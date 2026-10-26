import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIdempotentAttempt } from '@/hooks/useIdempotentAttempt';
import { queryKeys, useRepositories } from '@/repositories';
import { paymentProvider } from '@/services/integrations/payments';
import type { SendGiftCardRequest } from '@/types';

export function useGiftCard() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.giftCard, queryFn: () => repos.giftCards.getGiftCard() });
}

export function useGiftCardActivity() {
  const repos = useRepositories();
  return useQuery({ queryKey: queryKeys.giftActivity, queryFn: () => repos.giftCards.getActivity() });
}

/** "Pay $50 with Apple Pay" — demo Apple Pay token, then the eGift purchase. */
export function useSendGiftCard() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const attempt = useIdempotentAttempt('gift_');
  return useMutation({
    mutationFn: async (req: Omit<SendGiftCardRequest, 'paymentToken'>) => {
      const idempotencyKey = attempt.keyFor(req);
      try {
        const { token } = await paymentProvider.requestApplePay({ amount: req.amount, label: 'EightyTwenty eGift card' });
        const sent = await repos.giftCards.sendGiftCard({ ...req, paymentToken: token }, { idempotencyKey });
        attempt.settle();
        return sent;
      } catch (e) {
        attempt.settle(e);
        throw e;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.giftCard }),
  });
}
