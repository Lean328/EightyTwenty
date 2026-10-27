/**
 * app.json plus what depends on the build's environment: the Apple Pay merchant entitlement
 * is added only when EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID is set (eas.json build profile), since a
 * merchant ID the Apple account does not own breaks code signing.
 */
module.exports = ({ config }) => {
  const merchant = process.env.EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID;
  if (!merchant) return config;
  return {
    ...config,
    ios: {
      ...config.ios,
      entitlements: { ...config.ios?.entitlements, 'com.apple.developer.in-app-payments': [merchant] },
    },
  };
};
