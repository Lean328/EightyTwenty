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

describe('walletPassService.addPass (real passes)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the add page in an in-app sheet and closes it when the page links back', async () => {
    const { Linking } = jest.requireActual<typeof import('react-native')>('react-native');
    const WebBrowser = jest.requireMock<{ openBrowserAsync: jest.Mock; dismissBrowser: jest.Mock }>('expo-web-browser');
    const { walletPassService } = jest.requireActual<typeof import('@/services/integrations/wallet')>('@/services/integrations/wallet');
    let onUrl: ((e: { url: string }) => void) | undefined;
    const remove = jest.fn();
    jest.spyOn(Linking, 'addEventListener').mockImplementation(((_: string, cb: (e: { url: string }) => void) => {
      onUrl = cb;
      return { remove };
    }) as never);
    WebBrowser.openBrowserAsync.mockImplementationOnce(async () => {
      onUrl?.({ url: 'eightytwenty://loyalty?walletAdded=1' });
      return { type: 'dismiss' };
    });
    await expect(walletPassService.addPass('https://api.example/api/v1/app/wallet/add?ticket=t')).resolves.toBe('closed');
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith('https://api.example/api/v1/app/wallet/add?ticket=t', expect.anything());
    expect(WebBrowser.dismissBrowser).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
  });
});
