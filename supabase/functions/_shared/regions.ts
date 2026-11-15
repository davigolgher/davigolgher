/**
 * Which provider connects a bank in which country.
 *
 *   · Brazil → Pluggy (Open Finance Brasil).
 *   · The countries Plaid covers (its CountryCode list in the official SDK,
 *     v51: US, CA, GB and 17 EU/EEA countries) → Plaid.
 *   · Anywhere else → Salt Edge, which covers banks across Europe, the
 *     Americas, Asia-Pacific and the Middle East.
 *
 * When the preferred provider isn't configured on this server, the next one
 * that is takes over (Salt Edge also covers most of Plaid's countries), so a
 * deployment can start with any subset. The app shows the same list
 * (src/lib/family/countries.ts) and asks the server which providers are on.
 */

export type ProviderId = "pluggy" | "plaid" | "saltedge";

export const PLAID_COUNTRIES = [
  "US", "CA", "GB", "IE", "FR", "ES", "NL", "DE", "IT", "PL", "DK", "NO", "SE", "EE", "LT", "LV", "PT", "BE", "AT", "FI",
] as const;

export function preferredProviders(country: string | null | undefined): ProviderId[] {
  const c = (country ?? "").toUpperCase();
  if (c === "BR") return ["pluggy", "saltedge"];
  if ((PLAID_COUNTRIES as readonly string[]).includes(c)) return ["plaid", "saltedge"];
  return ["saltedge"];
}

export function providerFor(country: string | null | undefined, available: Record<ProviderId, boolean>): ProviderId | null {
  return preferredProviders(country).find((p) => available[p]) ?? null;
}
