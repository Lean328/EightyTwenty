import type { CartLine, FulfilmentMethod, MenuItem, ModifierGroup, ModifierSelections, Money, OrderTotals, PaymentChoice } from '@/types';
import { ORDER_RULES } from '@/constants/business';

/** Item price plus every selected modifier. */
export function unitPrice(item: Pick<MenuItem, 'price' | 'modifierGroups'>, selections: ModifierSelections): Money {
  let price = item.price;
  for (const group of item.modifierGroups) {
    for (const name of selections[group.id] ?? []) {
      const option = group.options.find((o) => o.name === name);
      if (option) price += option.price;
    }
  }
  return price;
}

/** "Flat White, Oat ADC" — the selected options in menu order. */
export function modifiersLabel(item: Pick<MenuItem, 'modifierGroups'>, selections: ModifierSelections): string {
  return item.modifierGroups.flatMap((g) => selections[g.id] ?? []).join(', ');
}

export function firstMissingGroup(item: Pick<MenuItem, 'modifierGroups'>, selections: ModifierSelections): ModifierGroup | undefined {
  return item.modifierGroups.find((g) => g.required && !(selections[g.id] ?? []).length);
}

export function hasMissingRequired(item: Pick<MenuItem, 'modifierGroups'>, selections: ModifierSelections): boolean {
  return firstMissingGroup(item, selections) !== undefined;
}

/** Pre-selects a required single-choice group that has only one option. */
export function defaultSelections(item: Pick<MenuItem, 'modifierGroups'>): ModifierSelections {
  const sel: ModifierSelections = {};
  for (const g of item.modifierGroups) {
    if (g.required && g.maxSelections === 1 && g.options.length === 1) sel[g.id] = [g.options[0]!.name];
  }
  return sel;
}

/** Toggle an option respecting single/multi choice rules. */
export function toggleOption(group: ModifierGroup, selections: ModifierSelections, name: string): ModifierSelections {
  const current = selections[group.id] ?? [];
  let next: string[];
  if (group.maxSelections === 1) next = current[0] === name && !group.required ? [] : [name];
  else next = current.includes(name) ? current.filter((x) => x !== name) : current.concat(name);
  return { ...selections, [group.id]: next };
}

export interface TotalsInput {
  lines: Pick<CartLine, 'unitPrice' | 'qty' | 'isCoffee'>[];
  method: FulfilmentMethod;
  payment: PaymentChoice;
  stamps: number;
  stampsPerReward: number;
  useReward: boolean;
  useGiftCard: boolean;
  giftCardBalance: Money;
}

export interface CartTotals extends OrderTotals {
  /** Customer has a full card and at least one coffee in the cart. */
  rewardAvailable: boolean;
  /** Coffees in the cart (stamps earned before the reward adjustment). */
  coffeeCount: number;
  itemCount: number;
}

/** Dollars → whole cents. Prices have at most two decimals, so this is exact. */
export function toCents(dollars: Money): number {
  return Math.round(dollars * 100);
}

/**
 * Round half-up to cents (1.005 → 1.01). Uses decimal shifting so a value stored as
 * 1.00499… still rounds the way a person would.
 */
export function roundCents(n: number): Money {
  const shifted = Math.round(Number(`${n}e2`));
  return Number.isFinite(shifted) ? shifted / 100 : Math.round(n * 100) / 100;
}

/**
 * `cents × rate`, rounded half-up to a whole cent, in integer arithmetic. The rate is
 * applied in basis points (0.0295 → 295), so 10% of $23.65 is exactly 236.5¢ → $2.37
 * rather than the float 2.3649999… → $2.36.
 */
function applyRate(cents: number, rate: number): number {
  return Math.round((cents * Math.round(rate * 10_000)) / 10_000);
}

/**
 * Order totals — port of the prototype's `totals()`:
 * subtotal → +10% delivery → −free coffee (cheapest coffee) → +2.95% card surcharge
 * → −gift card (up to the remaining total).
 * Computed in integer cents with half-up rounding at each rate, so the lines shown at
 * checkout always add up to the total and a server using exact decimal maths agrees to
 * the cent. The server must recompute these; the client value is for confirmation only.
 */
export function computeTotals(input: TotalsInput): CartTotals {
  const subtotal = input.lines.reduce((a, l) => a + toCents(l.unitPrice) * l.qty, 0);
  const delivery = input.method === 'Delivery' ? applyRate(subtotal, ORDER_RULES.deliveryRate) : 0;
  const coffees = input.lines.filter((l) => l.isCoffee);
  const rewardAvailable = input.stamps >= input.stampsPerReward && coffees.length > 0;
  const reward = rewardAvailable && input.useReward ? Math.min(...coffees.map((l) => toCents(l.unitPrice))) : 0;
  const isCard = input.payment === 'saved_card' || input.payment === 'new_card';
  const surcharge = isCard ? applyRate(Math.max(0, subtotal + delivery - reward), ORDER_RULES.cardSurchargeRate) : 0;
  const preGift = subtotal + delivery - reward + surcharge;
  const giftCard = input.useGiftCard ? Math.max(0, Math.min(toCents(input.giftCardBalance), preGift)) : 0;
  return {
    subtotal: subtotal / 100,
    delivery: delivery / 100,
    reward: reward / 100,
    surcharge: surcharge / 100,
    giftCard: giftCard / 100,
    total: Math.max(0, preGift - giftCard) / 100,
    rewardAvailable,
    coffeeCount: coffees.reduce((a, l) => a + l.qty, 0),
    itemCount: input.lines.reduce((a, l) => a + l.qty, 0),
  };
}

export function subtotalOf(lines: Pick<CartLine, 'unitPrice' | 'qty'>[]): Money {
  return lines.reduce((a, l) => a + toCents(l.unitPrice) * l.qty, 0) / 100;
}

export function itemCountOf(lines: Pick<CartLine, 'qty'>[]): number {
  return lines.reduce((a, l) => a + l.qty, 0);
}
