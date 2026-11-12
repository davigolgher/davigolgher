/**
 * Flow Family is in a build as a whole, or not in it at all.
 *
 * A build-time switch, on purpose. The App Store reviews what a build can do
 * (Guidelines 2.3.1 and 2.5.19: no hidden or dormant features), so a feature
 * that a server could turn on after review would be one the reviewer never
 * saw. With this unset, none of the Family routes, providers or entry points
 * are mounted and the app behaves exactly as it did before the feature
 * existed.
 *
 * Expo inlines EXPO_PUBLIC_* at bundle time: set it in mobile/.env for
 * development, and on the EAS build profile for a store build.
 */
export const FAMILY_ENABLED = process.env.EXPO_PUBLIC_FLOW_FAMILY === "1";
