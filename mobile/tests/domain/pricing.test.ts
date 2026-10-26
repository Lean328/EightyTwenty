import { computeTotals, defaultSelections, firstMissingGroup, hasMissingRequired, modifiersLabel, roundCents, toggleOption, unitPrice } from '@/domain/pricing';
import { drinkGroup, extrasGroup, item, line } from '../helpers';

describe('unitPrice / modifiersLabel', () => {
  const coffee = item({ price: 5, modifierGroups: [drinkGroup, extrasGroup] });

  it('adds every selected modifier price', () => {
    expect(unitPrice(coffee, { drink: ['Flat White'], add: ['Poached Egg', 'Avocado'] })).toBe(13.5);
  });

  it('ignores unknown options', () => {
    expect(unitPrice(coffee, { drink: ['Mystery'] })).toBe(5);
  });

  it('labels options in menu order', () => {
    expect(modifiersLabel(coffee, { add: ['Avocado'], drink: ['Espresso'] })).toBe('Espresso, Avocado');
  });
});

describe('required options', () => {
  const coffee = item({ modifierGroups: [drinkGroup, extrasGroup] });

  it('detects the first missing required group', () => {
    expect(hasMissingRequired(coffee, {})).toBe(true);
    expect(firstMissingGroup(coffee, {})?.id).toBe('drink');
    expect(hasMissingRequired(coffee, { drink: ['Espresso'] })).toBe(false);
  });

  it('pre-selects a required group with a single option', () => {
    const bun = { id: 'gfo', name: 'Bun', required: true, maxSelections: 1, options: [{ name: 'Milk Bun', price: 0 }] };
    expect(defaultSelections(item({ modifierGroups: [bun] }))).toEqual({ gfo: ['Milk Bun'] });
  });
});

describe('toggleOption', () => {
  it('single choice replaces, and required single choice cannot be cleared', () => {
    let sel = toggleOption(drinkGroup, {}, 'Flat White');
    sel = toggleOption(drinkGroup, sel, 'Espresso');
    expect(sel.drink).toEqual(['Espresso']);
    expect(toggleOption(drinkGroup, sel, 'Espresso').drink).toEqual(['Espresso']);
  });

  it('optional single choice toggles off', () => {
    const optional = { ...drinkGroup, required: false };
    expect(toggleOption(optional, { drink: ['Espresso'] }, 'Espresso').drink).toEqual([]);
  });

  it('multi choice adds and removes', () => {
    let sel = toggleOption(extrasGroup, {}, 'Avocado');
    sel = toggleOption(extrasGroup, sel, 'Poached Egg');
    expect(sel.add).toEqual(['Avocado', 'Poached Egg']);
    expect(toggleOption(extrasGroup, sel, 'Avocado').add).toEqual(['Poached Egg']);
  });
});

describe('computeTotals (port of the prototype totals())', () => {
  const base = { method: 'Pickup' as const, payment: 'apple_pay' as const, stamps: 0, stampsPerReward: 9, useReward: false, useGiftCard: false, giftCardBalance: 0 };

  it('sums lines for pickup with Apple Pay', () => {
    const t = computeTotals({ ...base, lines: [line({ unitPrice: 26, qty: 2 }), line({ unitPrice: 5, qty: 1, isCoffee: true })] });
    expect(t).toMatchObject({ subtotal: 57, delivery: 0, surcharge: 0, total: 57, coffeeCount: 1, itemCount: 3, rewardAvailable: false });
  });

  it('adds 10% delivery', () => {
    const t = computeTotals({ ...base, method: 'Delivery', lines: [line({ unitPrice: 20 })] });
    expect(t.delivery).toBe(2);
    expect(t.total).toBe(22);
  });

  it('adds the 2.95% card surcharge on subtotal + delivery − reward', () => {
    const t = computeTotals({ ...base, payment: 'saved_card', lines: [line({ unitPrice: 57 })] });
    expect(t.surcharge).toBe(1.68);
    expect(t.total).toBe(58.68);
  });

  it('applies the free coffee to the cheapest coffee only when the card is full', () => {
    const lines = [line({ unitPrice: 6, isCoffee: true }), line({ unitPrice: 5.5, isCoffee: true }), line({ unitPrice: 22 })];
    expect(computeTotals({ ...base, stamps: 8, useReward: true, lines }).reward).toBe(0);
    const t = computeTotals({ ...base, stamps: 9, useReward: true, lines });
    expect(t.rewardAvailable).toBe(true);
    expect(t.reward).toBe(5.5);
    expect(t.total).toBe(28); // 6 + 5.5 + 22 − 5.5
  });

  it('caps the gift card at the remaining total and applies it after the surcharge', () => {
    const t = computeTotals({ ...base, payment: 'saved_card', useGiftCard: true, giftCardBalance: 42.5, lines: [line({ unitPrice: 57 })] });
    expect(t.giftCard).toBe(42.5);
    expect(t.total).toBe(16.18);
    const covered = computeTotals({ ...base, useGiftCard: true, giftCardBalance: 100, lines: [line({ unitPrice: 12 })] });
    expect(covered.giftCard).toBe(12);
    expect(covered.total).toBe(0);
  });
});

describe('cent rounding', () => {
  it('rounds half-up the way a person would', () => {
    expect(roundCents(1.005)).toBe(1.01);
    expect(roundCents(1.235)).toBe(1.24);
    expect(roundCents(16.1849999)).toBe(16.18);
    expect(roundCents(0)).toBe(0);
    expect(roundCents(1e-7)).toBe(0);
  });

  it('rates are exact to the cent (no float drift before rounding)', () => {
    const base = { payment: 'apple_pay' as const, stamps: 0, stampsPerReward: 9, useReward: false, useGiftCard: false, giftCardBalance: 0 };
    // 23.65 × 0.1 is 2.3649999… in floating point; exact decimal maths gives 2.365 → 2.37
    expect(computeTotals({ ...base, method: 'Delivery', lines: [line({ unitPrice: 23.65 })] }).delivery).toBe(2.37);
    // 110 × 0.0295 is 3.2449999… in floating point; exact gives 3.245 → 3.25
    expect(computeTotals({ ...base, method: 'Pickup', payment: 'saved_card', lines: [line({ unitPrice: 110 })] }).surcharge).toBe(3.25);
  });

  it('matches exact decimal half-up rounding for every subtotal in 5-cent steps to $200', () => {
    const base = { stamps: 0, stampsPerReward: 9, useReward: false, useGiftCard: false, giftCardBalance: 0 };
    // Reference: integer maths on cents with rates in basis points, half-up.
    const exact = (cents: number, bp: number) => Math.floor((cents * bp + 5000) / 10000);
    for (let cents = 5; cents <= 20000; cents += 5) {
      const t = computeTotals({ ...base, method: 'Delivery', payment: 'saved_card', lines: [line({ unitPrice: cents / 100 })] });
      const delivery = exact(cents, 1000);
      expect(Math.round(t.delivery * 100)).toBe(delivery);
      expect(Math.round(t.surcharge * 100)).toBe(exact(cents + delivery, 295));
    }
  });

  it('displayed parts always add up to the total', () => {
    const base = { payment: 'saved_card' as const, stamps: 0, stampsPerReward: 9, useReward: false, useGiftCard: true, giftCardBalance: 3.33 };
    for (const price of [12.35, 7.15, 4.45, 19.95, 33.3]) {
      const t = computeTotals({ ...base, method: 'Delivery', lines: [line({ unitPrice: price, qty: 3 })] });
      const sum = roundCents(t.subtotal + t.delivery - t.reward + t.surcharge - t.giftCard);
      expect(t.total).toBe(sum);
    }
  });
});
