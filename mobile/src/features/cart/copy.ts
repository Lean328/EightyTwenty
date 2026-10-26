import { ORDER_RULES } from '@/constants/business';
import { opensAtLabel, isOpenNow } from '@/domain/hours';
import type { Location, OrderContext } from '@/types';
import { formatTimeOfDay } from '@/utils/format';

/** "Pickup from Phillip" / "Dine In at Braddon" */
export function orderContextTitle(ctx: OrderContext, location: Location | undefined): string {
  return `${ctx.method}${ctx.method === 'Dine In' ? ' at ' : ' from '}${location?.name ?? '…'}`;
}

/** "ASAP · ready in about 20–25 min", "Closed now · opens 7am", "10:30 am today" */
export function orderTimingLabel(ctx: OrderContext, location: Location | undefined, now: Date = new Date()): string {
  if (ctx.timing.type === 'scheduled') return `${formatTimeOfDay(ctx.timing.time)} today`;
  if (!location) return 'ASAP';
  const wait = location.waitLabel ?? ORDER_RULES.defaultWait;
  return isOpenNow(location, now) ? `ASAP · ready in about ${wait}` : `Closed now · opens ${opensAtLabel(location, now)}`;
}

/** Loyalty line shown in the cart and checkout. */
export function earnLine(rewardReady: boolean, coffeeCount: number, stampsToGo: number): string {
  if (rewardReady) return coffeeCount ? 'Your free coffee is ready to use on this order.' : 'Add any coffee and it’s on us.';
  if (!coffeeCount) return 'Add a coffee to earn a stamp on your card.';
  const n = Math.min(coffeeCount, stampsToGo);
  return `This order earns ${n} ${n === 1 ? 'coffee stamp.' : 'coffee stamps.'}`;
}
