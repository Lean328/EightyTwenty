import { create } from 'zustand';
import * as cart from '@/domain/cart';
import type { CartLine, FulfilmentMethod, MenuItem, ModifierSelections, OrderContext, OrderTiming, PaymentChoice, TimeOfDay } from '@/types';

/**
 * Client-side cart and ordering context ("Pickup from Phillip · ASAP").
 * The cart lives on the device until checkout; the server re-prices it in POST /orders.
 * All line arithmetic is in src/domain/cart.ts.
 */
export const DEFAULT_LOCATION_ID = 'phillip';

interface CartState {
  lines: CartLine[];
  context: OrderContext;
  /** Checkout selections kept while moving between cart, checkout and sheets. */
  checkout: { payment: PaymentChoice; useGiftCard: boolean; useReward: boolean };

  addItem(item: MenuItem, selections: ModifierSelections, qty: number, note: string): void;
  updateLine(key: string, item: MenuItem, selections: ModifierSelections, qty: number, note: string): void;
  stepItem(itemId: string, delta: number): void;
  setItemQuantity(itemId: string, qty: number): void;
  changeLineQty(key: string, delta: number): void;
  removeLine(key: string): void;
  replaceLines(lines: CartLine[]): void;
  clear(): void;

  setLocation(locationId: string, methods: FulfilmentMethod[]): void;
  setMethod(method: FulfilmentMethod): void;
  setTiming(timing: OrderTiming): void;
  setScheduledTime(time: TimeOfDay): void;
  setDeliveryAddress(address: string): void;
  setTableNumber(table: string): void;
  setCheckout(patch: Partial<CartState['checkout']>): void;
  reset(): void;
}

const initialContext: OrderContext = {
  locationId: DEFAULT_LOCATION_ID,
  method: 'Pickup',
  timing: { type: 'asap' },
  deliveryAddress: '',
  tableNumber: '',
};

const initialCheckout: CartState['checkout'] = { payment: 'apple_pay', useGiftCard: false, useReward: false };

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  context: initialContext,
  checkout: initialCheckout,

  addItem: (item, selections, qty, note) => set((s) => ({ lines: cart.addLine(s.lines, cart.buildLine(item, selections, qty, note)) })),
  updateLine: (key, item, selections, qty, note) => set((s) => ({ lines: cart.replaceLine(s.lines, key, cart.buildLine(item, selections, qty, note, key)) })),
  stepItem: (itemId, delta) => set((s) => ({ lines: cart.stepItem(s.lines, itemId, delta) })),
  setItemQuantity: (itemId, qty) => set((s) => ({ lines: cart.setItemQuantity(s.lines, itemId, qty) })),
  changeLineQty: (key, delta) => set((s) => ({ lines: cart.changeLineQty(s.lines, key, delta) })),
  removeLine: (key) => set((s) => ({ lines: cart.removeLine(s.lines, key) })),
  replaceLines: (lines) => set({ lines }),
  clear: () => set({ lines: [], checkout: initialCheckout }),

  setLocation: (locationId, methods) =>
    set((s) => ({ context: { ...s.context, locationId, method: methods.includes(s.context.method) ? s.context.method : methods[0] ?? 'Pickup' } })),
  setMethod: (method) => set((s) => ({ context: { ...s.context, method } })),
  setTiming: (timing) => set((s) => ({ context: { ...s.context, timing } })),
  setScheduledTime: (time) => set((s) => ({ context: { ...s.context, timing: { type: 'scheduled', time } } })),
  setDeliveryAddress: (deliveryAddress) => set((s) => ({ context: { ...s.context, deliveryAddress } })),
  setTableNumber: (tableNumber) => set((s) => ({ context: { ...s.context, tableNumber } })),
  setCheckout: (patch) => set((s) => ({ checkout: { ...s.checkout, ...patch } })),
  reset: () => set({ lines: [], context: initialContext, checkout: initialCheckout }),
}));

/** Total quantity in the cart (selector — re-renders only when the count changes). */
export const useCartCount = () => useCartStore((s) => s.lines.reduce((a, l) => a + l.qty, 0));
