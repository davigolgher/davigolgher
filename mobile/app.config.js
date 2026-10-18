/**
 * app.json, plus one adjustment for store builds.
 *
 * Expo's iOS template allows plain-HTTP connections to local-network
 * addresses (NSAllowsLocalNetworking) so a development build can load its
 * JavaScript from the computer running Metro. A TestFlight or App Store build
 * never talks to the local network, so there the exception is removed and App
 * Transport Security requires HTTPS for every connection the app makes
 * (MASVS-NETWORK-1). EAS sets EAS_BUILD_PROFILE while building; the
 * `development` profile, and local builds, keep the exception.
 */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (!profile || profile === "development") return config;
  return {
    ...config,
    ios: {
      ...config.ios,
      infoPlist: {
        ...config.ios?.infoPlist,
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false },
      },
    },
  };
};
