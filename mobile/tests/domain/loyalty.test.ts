import { cardBalance, cardSummary, isCoffeeItem, isRewardReady, stampsAfterOrder, stampsToGo } from '@/domain/loyalty';

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

describe('cardBalance', () => {
  it('reads free coffees that add up from the server card', () => {
    const b = cardBalance({ stamps: 9, stampsPerReward: 9, rewards: 2, progressStamps: 3 });
    expect(b).toEqual({ rewards: 2, progress: 3, shown: 3, per: 9 });
    expect(cardSummary(b)).toBe('2 free coffees ready · 3 of 9 stamps');
  });

  it('shows a card that just filled up as nine stamps', () => {
    const b = cardBalance({ stamps: 9, stampsPerReward: 9, rewards: 1, progressStamps: 0 });
    expect(b.shown).toBe(9);
    expect(cardSummary(b)).toBe('Free coffee ready');
  });

  it('falls back to the capped stamps without rewards (mock mode)', () => {
    expect(cardBalance({ stamps: 9, stampsPerReward: 9 })).toEqual({ rewards: 1, progress: 0, shown: 9, per: 9 });
    expect(cardSummary(cardBalance({ stamps: 4, stampsPerReward: 9 }))).toBe('4 of 9 stamps');
  });
});
