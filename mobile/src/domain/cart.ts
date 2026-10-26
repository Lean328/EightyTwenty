import type { CartLine, MenuItem, ModifierSelections } from '@/types';
import { ORDER_RULES } from '@/constants/business';
import { localId } from '@/utils/id';
import { isCoffeeItem } from './loyalty';
import { modifiersLabel, unitPrice } from './pricing';

/**
 * Pure cart operations (ports of the prototype's pushLine / stepItem / setQty / changeQty).
 * The cart store calls these; nothing here touches React or storage.
 */
export function buildLine(item: MenuItem, selections: ModifierSelections, qty: number, note: string, key?: string): CartLine {
  return {
    key: key ?? localId('ln_'),
    itemId: item.id,
    name: item.name,
    image: item.image,
    qty,
    selections,
    note,
    unitPrice: unitPrice(item, selections),
    modifiersLabel: modifiersLabel(item, selections),
    isCoffee: isCoffeeItem(item),
  };
}

/** Adds a line, merging into an identical existing line (same item, options and note). */
export function addLine(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.itemId === line.itemId && l.modifiersLabel === line.modifiersLabel && l.note === line.note);
  if (i < 0) return [...lines, line];
  return lines.map((l, idx) => (idx === i ? { ...l, qty: l.qty + line.qty } : l));
}

/** Replaces the line with `key` (editing from the cart). */
export function replaceLine(lines: CartLine[], key: string, line: CartLine): CartLine[] {
  return lines.map((l) => (l.key === key ? { ...line, key } : l));
}

/** Steps the item's most recent cart line by `delta`; removes it at zero. */
export function stepItem(lines: CartLine[], itemId: string, delta: number): CartLine[] {
  const target = [...lines].reverse().find((l) => l.itemId === itemId);
  if (!target) return lines;
  const qty = target.qty + delta;
  return qty <= 0 ? lines.filter((l) => l !== target) : lines.map((l) => (l === target ? { ...l, qty } : l));
}

export function quantityOfItem(lines: CartLine[], itemId: string): number {
  return lines.filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty, 0);
}

/**
 * Sets the item's total quantity across its lines (typed in the menu stepper).
 * Increases go on the most recent line; decreases come off the most recent lines first.
 */
export function setItemQuantity(lines: CartLine[], itemId: string, quantity: number): CartLine[] {
  const n = clampQty(quantity);
  let delta = n - quantityOfItem(lines, itemId);
  if (delta === 0) return lines;
  const next = [...lines];
  for (let i = next.length - 1; i >= 0 && delta !== 0; i--) {
    const l = next[i]!;
    if (l.itemId !== itemId) continue;
    if (delta > 0) {
      next[i] = { ...l, qty: l.qty + delta };
      delta = 0;
    } else {
      const take = Math.min(l.qty, -delta);
      delta += take;
      next[i] = { ...l, qty: l.qty - take };
    }
  }
  return next.filter((l) => l.qty > 0);
}

export function changeLineQty(lines: CartLine[], key: string, delta: number): CartLine[] {
  return lines.flatMap((l) => (l.key !== key ? [l] : l.qty + delta <= 0 ? [] : [{ ...l, qty: l.qty + delta }]));
}

export function removeLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((l) => l.key !== key);
}

export function clampQty(n: number): number {
  return Math.max(0, Math.min(ORDER_RULES.maxLineQtyInput, Math.floor(Number(n) || 0)));
}
