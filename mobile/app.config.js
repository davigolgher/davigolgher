/**
 * app.json, plus adjustments that depend on how the app is being built.
 *
 * Store builds. Expo's iOS template allows plain-HTTP connections to
 * local-network addresses (NSAllowsLocalNetworking) so a development build can
 * load its JavaScript from the computer running Metro. A TestFlight or App
 * Store build never talks to the local network, so there the exception is
 * removed and App Transport Security requires HTTPS for every connection the
 * app makes (MASVS-NETWORK-1). EAS sets EAS_BUILD_PROFILE while building; the
 * `development` profile, and local builds, keep the exception.
 *
 * Flow Family (EXPO_PUBLIC_FLOW_FAMILY=1). A build with the feature also:
 *   · registers for remote push (the expo-notifications plugin adds the
 *     aps-environment entitlement on iOS), for the guardian's alerts;
 *   · declares, in the iOS privacy manifest, the extra data it collects: the
 *     names people give themselves in a family, a minor's date of birth and
 *     the network address recorded with a consent ("other data"), and the
 *     push token ("device ID"). All linked to the account, none for tracking.
 * A build without it is exactly app.json.
 */
const FAMILY = process.env.EXPO_PUBLIC_FLOW_FAMILY === "1";

const familyDataTypes = [
  "NSPrivacyCollectedDataTypeName",
  "NSPrivacyCollectedDataTypeOtherDataTypes",
  "NSPrivacyCollectedDataTypeDeviceID",
].map((type) => ({
  NSPrivacyCollectedDataType: type,
  NSPrivacyCollectedDataTypeLinked: true,
  NSPrivacyCollectedDataTypeTracking: false,
  NSPrivacyCollectedDataTypePurposes: ["NSPrivacyCollectedDataTypePurposeAppFunctionality"],
}));

function withFamily(config) {
  if (!FAMILY) return config;
  const manifest = config.ios?.privacyManifests ?? {};
  const collected = manifest.NSPrivacyCollectedDataTypes ?? [];
  const have = new Set(collected.map((c) => c.NSPrivacyCollectedDataType));
  return {
    ...config,
    ios: {
      ...config.ios,
      privacyManifests: {
        ...manifest,
        NSPrivacyCollectedDataTypes: [...collected, ...familyDataTypes.filter((c) => !have.has(c.NSPrivacyCollectedDataType))],
      },
    },
    plugins: [...(config.plugins ?? []), ["expo-notifications", { color: "#0A0A0A" }]],
  };
}

module.exports = ({ config }) => {
  const withFeatures = withFamily(config);
  const profile = process.env.EAS_BUILD_PROFILE;
  if (!profile || profile === "development") return withFeatures;
  return {
    ...withFeatures,
    ios: {
      ...withFeatures.ios,
      infoPlist: {
        ...withFeatures.ios?.infoPlist,
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: false, NSAllowsLocalNetworking: false },
      },
    },
  };
};
