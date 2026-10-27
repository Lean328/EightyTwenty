/** Prototype features that need a missing third party: shown with mock data, hidden on the real API. */
function featuresFor(env: Record<string, string>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    let features: { walletPasses: boolean; nearestCafe: boolean } | undefined;
    jest.isolateModules(() => {
      features = (require('@/constants/config') as typeof import('@/constants/config')).config.features;
    });
    return features!;
  } finally {
    process.env = saved;
  }
}

describe('config.features', () => {
  it('keeps Apple Wallet and "Use my location" in the mock prototype', () => {
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'mock' })).toEqual({ walletPasses: true, nearestCafe: true });
  });

  it('hides them against the real API until switched on', () => {
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'api' })).toEqual({ walletPasses: false, nearestCafe: false });
    expect(featuresFor({ EXPO_PUBLIC_DATA_SOURCE: 'api', EXPO_PUBLIC_WALLET_PASSES: 'true' }).walletPasses).toBe(true);
  });
});
