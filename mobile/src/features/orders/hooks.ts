import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isLiveStatus } from '@/domain/orders';
import { useIdempotentAttempt } from '@/hooks/useIdempotentAttempt';
import { useNow } from '@/hooks/useNow';
import { queryKeys, useRepositories } from '@/repositories';
import { AppError } from '@/services/errors';
import { paymentProvider, type DemoCardInput } from '@/services/integrations/payments';
import type { CreateOrderRequest, Order } from '@/types';

/** Live order — polls every 2s while in progress (swap for push/websocket in production). */
export function useOrder(id: string | undefined) {
  const repos = useRepositories();
  return useQuery({
    queryKey: queryKeys.order(id ?? ''),
    queryFn: () => repos.orders.getOrder(id!),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && isLiveStatus(q.state.data.status) ? 2000 : false),
  });
}

export function useOrderHistory() {
  const repos = useRepositories();
  return useInfiniteQuery({
    queryKey: queryKeys.orderHistory,
    queryFn: ({ pageParam }) => repos.orders.getOrderHistory({ cursor: pageParam, limit: 20 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** An order placed in the last 12 hours that the café has not finished yet (Home links to it). */
export function useLiveOrder(): Order | undefined {
  const history = useOrderHistory();
  const since = useNow().getTime() - 12 * 60 * 60 * 1000;
  return history.data?.pages[0]?.items.find((o) => isLiveStatus(o.status) && Date.parse(o.createdAt) > since);
}

export type PlaceOrderInput = Omit<CreateOrderRequest, 'payment'> & {
  payment: Omit<CreateOrderRequest['payment'], 'token'>;
  /** New-card details for the provider's tokeniser. Never sent to the EightyTwenty backend. */
  newCard?: DemoCardInput;
};

/**
 * Pay + place order. The payment provider issues a single-use token first (Apple Pay sheet
 * or card tokenisation — demo provider here), then the order is created server-side with a
 * retry-safe idempotency key, and every affected cache is refreshed so history, stamps and
 * gift balance stay consistent across screens.
 */
export function usePlaceOrder() {
  const repos = useRepositories();
  const qc = useQueryClient();
  const attempt = useIdempotentAttempt('ord_');
  return useMutation({
    mutationFn: async ({ newCard, ...req }: PlaceOrderInput): Promise<Order> => {
      const idempotencyKey = attempt.keyFor(req);
      try {
        let token: string | undefined;
        if (req.expectedTotal > 0 && req.payment.choice === 'apple_pay') {
          token = (await paymentProvider.requestApplePay({ amount: req.expectedTotal, label: 'EightyTwenty' })).token;
        }
        if (req.expectedTotal > 0 && req.payment.choice === 'new_card') {
          if (!newCard) throw new AppError('VALIDATION', 'Add your card details.');
          token = (await paymentProvider.tokenizeCard(newCard)).token;
        }
        const order = await repos.orders.createOrder({ ...req, payment: { ...req.payment, token } }, { idempotencyKey });
        attempt.settle();
        return order;
      } catch (e) {
        attempt.settle(e);
        throw e;
      }
    },
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: queryKeys.orderHistory });
      void qc.invalidateQueries({ queryKey: queryKeys.loyalty });
      void qc.invalidateQueries({ queryKey: queryKeys.giftCard });
    },
  });
}
