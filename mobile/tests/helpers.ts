import type { CartLine, MenuItem, ModifierGroup } from '@/types';

/** Small fixtures for unit tests (independent of the demo catalogue). */
export const drinkGroup: ModifierGroup = {
  id: 'drink',
  name: 'Choose your drink',
  required: true,
  maxSelections: 1,
  options: [
    { name: 'Flat White', price: 0.5 },
    { name: 'Espresso', price: 0 },
  ],
};

export const extrasGroup: ModifierGroup = {
  id: 'add',
  name: 'Add ons',
  required: false,
  maxSelections: 0,
  options: [
    { name: 'Poached Egg', price: 3 },
    { name: 'Avocado', price: 5 },
  ],
};

export function item(partial: Partial<MenuItem> = {}): MenuItem {
  return {
    id: 'item',
    categoryId: 'allday',
    name: 'Test Item',
    description: '',
    price: 10,
    dietary: [],
    image: null,
    featured: false,
    modifierGroups: [],
    ...partial,
  };
}

export function line(partial: Partial<CartLine> = {}): CartLine {
  return {
    key: partial.key ?? Math.random().toString(36).slice(2),
    itemId: 'item',
    name: 'Test Item',
    image: null,
    qty: 1,
    selections: {},
    note: '',
    unitPrice: 10,
    modifiersLabel: '',
    isCoffee: false,
    ...partial,
  };
}

/** A local Date at the given wall-clock time. */
export const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
