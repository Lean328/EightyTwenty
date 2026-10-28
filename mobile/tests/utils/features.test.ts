/** Prototype features that need a missing third party: shown with mock data, hidden on the real API. */
function featuresFor(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    let features: { walletPasses: boolean; nearestCafe: boolean; giftCardSales: boolean; savedCards: boolean; showPrices: boolean; ordering: boolean } | undefined;
    jest.isolateModules(() => {
      features = (require('@/constants/config') as typeof import('@/constants/config')).config.features;
    });
    return features!;
  } finally {
    process.env = saved;
  }
}

describe('config.features', () => {
  it('keeps Apple Wallet, "Use my location", eGift and saved cards in the mock prototype', () => {
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'mock' })).toEqual({ walletPasses: true, nearestCafe: true, giftCardSales: true, savedCards: true, showPrices: false, ordering: false });
  });

  it('hides them against the real API until switched on', () => {
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'api' })).toEqual({ walletPasses: false, nearestCafe: false, giftCardSales: false, savedCards: false, showPrices: false, ordering: false });
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_GIFT_CARD_SALES: 'true' }).giftCardSales).toBe(true);
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_WALLET_PASSES: 'true' }).walletPasses).toBe(true);
  });

  it('hides prices and checkout in every mode until switched back on (client request 28/10/2026)', () => {
    const on = featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_SHOW_PRICES: 'true', EXPO_PUBLIC_ORDERING: 'true' });
    expect([on.showPrices, on.ordering]).toEqual([true, true]);
  });
});
