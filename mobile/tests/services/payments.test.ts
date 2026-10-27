import { squareProvider } from '@/services/integrations/payments';

/** Square's SDK replaced by a script: what the sheets would hand back. */
function fakeSdk(card: { nonce?: string; brand?: number; cancel?: boolean }, applePay: { nonce?: string; fail?: string } = {}) {
  const sdk = {
    PaymentType: { PaymentTypeFinal: 2 },
    SQIPCore: { setSquareApplicationId: jest.fn() },
    SQIPCardEntry: {
      startCardEntryFlow: jest.fn((_config, onNonce: (d: object) => void, onCancel: () => void) =>
        card.cancel ? onCancel() : onNonce({ nonce: card.nonce, card: { brand: card.brand, lastFourDigits: '1111', expirationMonth: 3, expirationYear: 2031 } }),
      ),
      completeCardEntry: jest.fn((done: () => void) => done()),
    },
    SQIPApplePay: {
      initializeApplePay: jest.fn(),
      canUseApplePay: jest.fn(async () => true),
      completeApplePayAuthorization: jest.fn(),
      requestApplePayNonce: jest.fn(async (_config, onNonce: (d: object) => void, onFail: (e: object) => void, onComplete: () => void) => {
        if (applePay.fail) onFail({ message: applePay.fail });
        else if (applePay.nonce) onNonce({ nonce: applePay.nonce });
        onComplete();
      }),
    },
  };
  return sdk as unknown as Parameters<typeof squareProvider>[0] & typeof sdk;
}

describe('Square payment provider', () => {
  it('turns the card sheet into a token with brand and last four', async () => {
    const sdk = fakeSdk({ nonce: 'cnon:ok', brand: 1 });
    const provider = squareProvider(sdk, 'sq0idp-app', 'merchant.test');
    await expect(provider.tokenizeCard()).resolves.toEqual({ token: 'cnon:ok', brand: 'Visa', last4: '1111', expiry: '03/31' });
    expect(sdk.SQIPCore.setSquareApplicationId).toHaveBeenCalledWith('sq0idp-app');
    expect(provider.cardEntryInApp).toBe(false);
  });

  it('closing the card sheet is a cancel, not an error message', async () => {
    const provider = squareProvider(fakeSdk({ cancel: true }), 'sq0idp-app', '');
    await expect(provider.tokenizeCard()).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('Apple Pay: nonce on success, cancel when dismissed, message on failure', async () => {
    const ok = fakeSdk({}, { nonce: 'cnon:apple' });
    await expect(squareProvider(ok, 'app', 'merchant.test').requestApplePay({ amount: 29.3, label: 'EightyTwenty' })).resolves.toEqual({ token: 'cnon:apple' });
    expect(ok.SQIPApplePay.requestApplePayNonce.mock.calls[0]![0]).toMatchObject({ price: '29.30', countryCode: 'AU', currencyCode: 'AUD' });
    expect(ok.SQIPApplePay.completeApplePayAuthorization).toHaveBeenCalledWith(true);
    await expect(squareProvider(fakeSdk({}), 'app', 'merchant.test').requestApplePay({ amount: 5, label: 'x' })).rejects.toMatchObject({ code: 'CANCELLED' });
    await expect(squareProvider(fakeSdk({}, { fail: 'Card not supported' }), 'app', 'merchant.test').requestApplePay({ amount: 5, label: 'x' })).rejects.toMatchObject({ code: 'PAYMENT_DECLINED', message: 'Card not supported' });
  });

  it('no Apple Pay without a merchant ID', async () => {
    await expect(squareProvider(fakeSdk({}), 'app', '').isApplePayAvailable()).resolves.toBe(false);
  });
});
