/**
 * Banks in Flow itself (EXPO_PUBLIC_FLOW_BANKS=1): connect your own bank and
 * its purchases become your expenses. Read once, at build time, like Flow
 * Family's flag: a build without it has no bank screens at all (Metro leaves
 * app/banks out, see metro.config.js) and nothing anywhere mentions banks.
 *
 * The feature needs the server side first: migrations 0012–0017 and the bank
 * Edge Functions, with at least one provider's keys (docs/produto/bancos.md).
 */
export const BANKS_ENABLED = process.env.EXPO_PUBLIC_FLOW_BANKS === "1";
