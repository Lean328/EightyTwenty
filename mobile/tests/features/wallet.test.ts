import { config } from '@/constants/config';
import { showWalletFor } from '@/features/loyalty/hooks';
import type { LoyaltyCard } from '@/types';

const card = (walletPassAvailable?: boolean): LoyaltyCard => ({
  stamps: 3,
  stampsPerReward: 9,
  memberNumber: '8020 1234 5678',
  eligibility: '',
  rewardDescription: '',
  walletPassAdded: false,
  walletPassAvailable,
});

describe('showWalletFor', () => {
  afterEach(() => jest.restoreAllMocks());

  it('follows the server on the real API: the button appears once passes can be issued', () => {
    jest.replaceProperty(config.features as { walletPasses: boolean }, 'walletPasses', false);
    expect(showWalletFor(card(false))).toBe(false);
    expect(showWalletFor(card(undefined))).toBe(false);
    expect(showWalletFor(card(true))).toBe(true);
  });

  it('keeps the prototype button in mock mode', () => {
    expect(showWalletFor(card(false))).toBe(true);
  });
});
