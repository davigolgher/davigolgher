/**
 * Where a person's bank is, as the connection screen offers it. The server
 * decides the provider (supabase/functions/_shared/regions.ts, the same
 * lists); the app only shows the countries a provider that's switched on
 * covers, and "Another country" when Salt Edge is on.
 */

export type ProviderId = "pluggy" | "plaid" | "saltedge";

export interface CountryOption {
  code: string;
  name: string;
  provider: ProviderId;
}

/** Plaid's countries (its official SDK's CountryCode list, v51). */
const PLAID: [string, string][] = [
  ["US", "United States"],
  ["CA", "Canada"],
  ["GB", "United Kingdom"],
  ["IE", "Ireland"],
  ["FR", "France"],
  ["ES", "Spain"],
  ["NL", "Netherlands"],
  ["DE", "Germany"],
  ["IT", "Italy"],
  ["PL", "Poland"],
  ["DK", "Denmark"],
  ["NO", "Norway"],
  ["SE", "Sweden"],
  ["EE", "Estonia"],
  ["LT", "Lithuania"],
  ["LV", "Latvia"],
  ["PT", "Portugal"],
  ["BE", "Belgium"],
  ["AT", "Austria"],
  ["FI", "Finland"],
];

/** "Another country": Salt Edge, with its own list of countries and banks. */
export const ANOTHER_COUNTRY = "XX";

export function countryOptions(available: Record<ProviderId, boolean>): CountryOption[] {
  const out: CountryOption[] = [];
  if (available.pluggy || available.saltedge) out.push({ code: "BR", name: "Brazil", provider: available.pluggy ? "pluggy" : "saltedge" });
  for (const [code, name] of PLAID) {
    if (available.plaid) out.push({ code, name, provider: "plaid" });
    else if (available.saltedge) out.push({ code, name, provider: "saltedge" });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  if (available.saltedge) out.push({ code: ANOTHER_COUNTRY, name: "Another country", provider: "saltedge" });
  return out;
}

/** The phone's own country first, when it's on the list; otherwise "Another country" leads if there is one. */
export function orderForRegion(options: CountryOption[], region: string | null | undefined): CountryOption[] {
  const code = (region ?? "").toUpperCase();
  const mine = options.find((o) => o.code === code) ?? (code ? options.find((o) => o.code === ANOTHER_COUNTRY) : undefined);
  return mine ? [mine, ...options.filter((o) => o !== mine)] : options;
}

export const PROVIDER_NAME: Record<ProviderId, string> = {
  pluggy: "Pluggy (Open Finance Brasil)",
  plaid: "Plaid",
  saltedge: "Salt Edge",
};
