import { addLine, buildLine, changeLineQty, clampQty, quantityOfItem, removeLine, replaceLine, setItemQuantity, stepItem } from '@/domain/cart';
import { drinkGroup, item, line } from '../helpers';

describe('cart line operations', () => {
  it('buildLine snapshots price, label and coffee flag', () => {
    const coffee = item({ id: 'hotcoffee', categoryId: 'coffee', name: 'Milk Based Coffee', price: 5, modifierGroups: [drinkGroup] });
    const l = buildLine(coffee, { drink: ['Flat White'] }, 2, 'extra hot');
    expect(l).toMatchObject({ itemId: 'hotcoffee', qty: 2, unitPrice: 5.5, modifiersLabel: 'Flat White', note: 'extra hot', isCoffee: true });
  });

  it('merges identical lines (same item, options and note)', () => {
    const a = line({ key: 'a', itemId: 'x', qty: 1, modifiersLabel: 'Oat' });
    const merged = addLine([a], line({ key: 'b', itemId: 'x', qty: 2, modifiersLabel: 'Oat' }));
    expect(merged).toHaveLength(1);
    expect(merged[0]!.qty).toBe(3);
    const separate = addLine([a], line({ key: 'c', itemId: 'x', qty: 1, modifiersLabel: 'Soy' }));
    expect(separate).toHaveLength(2);
  });

  it('replaceLine keeps the key (editing from the cart)', () => {
    const lines = [line({ key: 'k', qty: 1 })];
    expect(replaceLine(lines, 'k', line({ key: 'other', qty: 4 }))).toEqual([expect.objectContaining({ key: 'k', qty: 4 })]);
  });

  it('stepItem changes the most recent line and removes at zero', () => {
    const lines = [line({ key: 'a', itemId: 'x', qty: 1 }), line({ key: 'b', itemId: 'x', qty: 2 })];
    expect(stepItem(lines, 'x', 1).map((l) => l.qty)).toEqual([1, 3]);
    const down = stepItem([line({ key: 'a', itemId: 'x', qty: 1 })], 'x', -1);
    expect(down).toEqual([]);
  });

  it('setItemQuantity sets the total across lines', () => {
    const lines = [line({ key: 'a', itemId: 'x', qty: 2 }), line({ key: 'b', itemId: 'x', qty: 3 }), line({ key: 'c', itemId: 'y', qty: 1 })];
    expect(quantityOfItem(setItemQuantity(lines, 'x', 7), 'x')).toBe(7);
    const reduced = setItemQuantity(lines, 'x', 1);
    expect(reduced.filter((l) => l.itemId === 'x')).toEqual([expect.objectContaining({ key: 'a', qty: 1 })]);
    expect(setItemQuantity(lines, 'x', 0).some((l) => l.itemId === 'x')).toBe(false);
  });

  it('changeLineQty and removeLine', () => {
    const lines = [line({ key: 'a', qty: 1 }), line({ key: 'b', qty: 2 })];
    expect(changeLineQty(lines, 'b', -1).find((l) => l.key === 'b')!.qty).toBe(1);
    expect(changeLineQty(lines, 'a', -1).map((l) => l.key)).toEqual(['b']);
    expect(removeLine(lines, 'a').map((l) => l.key)).toEqual(['b']);
  });

  it('clampQty keeps typed quantities between 0 and 99', () => {
    expect(clampQty(-3)).toBe(0);
    expect(clampQty(150)).toBe(99);
    expect(clampQty(Number('abc'))).toBe(0);
    expect(clampQty(4.7)).toBe(4);
  });
});
