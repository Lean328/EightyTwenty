import { useCallback, useMemo } from 'react';
import { LOYALTY_RULES } from '@/constants/business';
import { quantityOfItem } from '@/domain/cart';
import { computeTotals, defaultSelections, hasMissingRequired, itemCountOf, subtotalOf, type CartTotals } from '@/domain/pricing';
import { useGiftCard } from '@/features/gift-cards/hooks';
import { useLoyaltyCard } from '@/features/loyalty/hooks';
import { useCartStore } from '@/store/cart';
import { showToast, useUiStore } from '@/store/ui';
import type { MenuItem } from '@/types';
import { formatMoney } from '@/utils/format';

/**
 * Cart actions used by menu rows, favourites and the Home rails. Items with required
 * options open the item sheet instead of adding blindly (prototype `stepItem`/`setQty`).
 */
export function useCartActions() {
  const openItem = useUiStore((s) => s.openItem);

  const step = useCallback(
    (item: MenuItem, delta: number) => {
      const { lines, stepItem, addItem } = useCartStore.getState();
      if (!lines.some((l) => l.itemId === item.id)) {
        if (delta <= 0) return;
        if (hasMissingRequired(item, {})) return openItem(item);
        return addItem(item, defaultSelections(item), 1, '');
      }
      stepItem(item.id, delta);
    },
    [openItem],
  );

  const setQuantity = useCallback(
    (item: MenuItem, qty: number) => {
      const { lines, setItemQuantity, addItem } = useCartStore.getState();
      if (qty === quantityOfItem(lines, item.id)) return;
      if (!lines.some((l) => l.itemId === item.id)) {
        if (qty <= 0) return;
        if (hasMissingRequired(item, {})) return openItem(item, { initialQty: qty });
        return addItem(item, defaultSelections(item), qty, '');
      }
      setItemQuantity(item.id, qty);
    },
    [openItem],
  );

  /** Add one from a list without a sheet (favourites "+"); shows a toast off the menu. */
  const quickAdd = useCallback(
    (item: MenuItem, toast = false) => {
      if (hasMissingRequired(item, {})) return openItem(item);
      useCartStore.getState().addItem(item, defaultSelections(item), 1, '');
      if (toast) showToast('Added ' + item.name);
    },
    [openItem],
  );

  return { step, setQuantity, quickAdd };
}

/** Quantity of each menu item in the cart. */
export function useCartQuantities(): Record<string, number> {
  const lines = useCartStore((s) => s.lines);
  return useMemo(() => {
    const q: Record<string, number> = {};
    for (const l of lines) q[l.itemId] = (q[l.itemId] ?? 0) + l.qty;
    return q;
  }, [lines]);
}

/** Live totals for cart/checkout from the cart, loyalty card and gift card balance. */
export function useCartTotals(): CartTotals & { giftCardBalance: number; stamps: number; stampsPerReward: number } {
  const lines = useCartStore((s) => s.lines);
  const method = useCartStore((s) => s.context.method);
  const checkout = useCartStore((s) => s.checkout);
  const { data: card } = useLoyaltyCard();
  const { data: gift } = useGiftCard();
  return useMemo(() => {
    const stamps = card?.stamps ?? 0;
    const stampsPerReward = card?.stampsPerReward ?? LOYALTY_RULES.stampsPerReward;
    const giftCardBalance = gift?.balance ?? 0;
    const totals = computeTotals({ lines, method, payment: checkout.payment, stamps, stampsPerReward, useReward: checkout.useReward, useGiftCard: checkout.useGiftCard, giftCardBalance });
    return { ...totals, giftCardBalance, stamps, stampsPerReward };
  }, [lines, method, checkout, card, gift]);
}

/** "2 items · $15.50" + "Pickup · Phillip" for the floating mini-cart. */
export function useMiniCartSummary(locationName: string) {
  const lines = useCartStore((s) => s.lines);
  const method = useCartStore((s) => s.context.method);
  const count = itemCountOf(lines);
  return {
    count,
    label: `${count === 1 ? '1 item' : `${count} items`} · ${formatMoney(subtotalOf(lines))}`,
    sub: `${method} · ${locationName}`,
  };
}
