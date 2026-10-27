// The Square SDK stays out of the iOS app until the café's Square account is connected
// (docs/SQUARE_SETUP.md): its frameworks shipped nested bundles and an unsigned `setup` file,
// and App Store Connect rejected build 6 (ITMS-90035/90205/90206). The app only loads Square
// when EXPO_PUBLIC_SQUARE_APPLICATION_ID is set, so nothing calls it in the meantime. To bring
// it back: delete this entry, re-add the plugin in app.json and check the upload is accepted.
module.exports = {
  dependencies: {
    'react-native-square-in-app-payments': { platforms: { ios: null } },
  },
};
