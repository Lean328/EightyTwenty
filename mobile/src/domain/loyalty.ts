import type { MenuItem } from '@/types';

/**
 * Which items earn a coffee stamp (and can be redeemed as the free coffee).
 * Eligibility: "Any coffee or hot drink, any size, at any EightyTwenty café."
 * Port of the prototype's `isCoffee`: everything in Coffee & Hot Drinks except the
 * Puppychino and the add-ons line, plus coffee-based cold drinks.
 */
export function isCoffeeItem(item: Pick<MenuItem, 'categoryId' | 'name'>): boolean {
  if (item.categoryId === 'coffee') return !/puppychino|add ons/i.test(item.name);
  return item.categoryId === 'cold' && /coffee|latte|long black|mocha|cold brew/i.test(item.name);
}

export interface StampOutcome {
  /** Stamps on the card after the order. */
  stamps: number;
  /** Stamps added by this order (drives the "stamp press" animation). */
  earned: number;
}

/**
 * Stamps after an order: redeeming the reward resets the card and the free coffee
 * doesn't earn a stamp. Capped at the reward threshold.
 */
export function stampsAfterOrder(params: {
  stamps: number;
  stampsPerReward: number;
  coffeeCount: number;
  rewardRedeemed: boolean;
}): StampOutcome {
  const base = params.rewardRedeemed ? 0 : params.stamps;
  const earnedRaw = Math.max(0, params.coffeeCount - (params.rewardRedeemed ? 1 : 0));
  const stamps = Math.min(params.stampsPerReward, base + earnedRaw);
  return { stamps, earned: Math.max(0, stamps - base) };
}

export function stampsToGo(stamps: number, stampsPerReward: number): number {
  return Math.max(0, stampsPerReward - stamps);
}

export function isRewardReady(stamps: number, stampsPerReward: number): boolean {
  return stamps >= stampsPerReward;
}
