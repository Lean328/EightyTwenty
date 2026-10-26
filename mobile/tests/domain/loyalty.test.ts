import { isCoffeeItem, isRewardReady, stampsAfterOrder, stampsToGo } from '@/domain/loyalty';

describe('isCoffeeItem (stamp eligibility)', () => {
  it.each([
    [{ categoryId: 'coffee', name: 'Milk Based Coffee' }, true],
    [{ categoryId: 'coffee', name: 'Sticky Chai' }, true],
    [{ categoryId: 'coffee', name: 'Puppychino' }, false],
    [{ categoryId: 'coffee', name: 'Add Ons' }, false],
    [{ categoryId: 'cold', name: 'Iced Latte' }, true],
    [{ categoryId: 'cold', name: 'Cold Brew' }, true],
    [{ categoryId: 'cold', name: 'Karma Cola (Organic)' }, false],
    [{ categoryId: 'allday', name: 'Mighty Breakfast' }, false],
  ])('%o → %s', (it_, expected) => {
    expect(isCoffeeItem(it_)).toBe(expected);
  });
});

describe('stampsAfterOrder', () => {
  it('adds one stamp per coffee', () => {
    expect(stampsAfterOrder({ stamps: 6, stampsPerReward: 9, coffeeCount: 1, rewardRedeemed: false })).toEqual({ stamps: 7, earned: 1 });
  });

  it('caps at nine stamps', () => {
    expect(stampsAfterOrder({ stamps: 8, stampsPerReward: 9, coffeeCount: 3, rewardRedeemed: false })).toEqual({ stamps: 9, earned: 1 });
  });

  it('redeeming resets the card and the free coffee earns nothing', () => {
    expect(stampsAfterOrder({ stamps: 9, stampsPerReward: 9, coffeeCount: 2, rewardRedeemed: true })).toEqual({ stamps: 1, earned: 1 });
    expect(stampsAfterOrder({ stamps: 9, stampsPerReward: 9, coffeeCount: 1, rewardRedeemed: true })).toEqual({ stamps: 0, earned: 0 });
  });

  it('progress helpers', () => {
    expect(stampsToGo(6, 9)).toBe(3);
    expect(isRewardReady(9, 9)).toBe(true);
    expect(isRewardReady(8, 9)).toBe(false);
  });
});
