/**
 * The few calls Flow makes to Plaid (United States, Canada, the UK and the
 * EU/EEA), over `fetch`.
 *
 * Paths, fields and environments follow Plaid's official Node SDK, v51
 * (`plaid` on npm): POST endpoints, credentials in the PLAID-CLIENT-ID and
 * PLAID-SECRET headers, API version 2020-09-14.
 *
 * The flow, all server-side except the bank screens:
 *   1. /link/token/create with `hosted_link` → a URL Plaid hosts, which the
 *      app opens in the system browser. OAuth banks redirect inside it.
 *   2. When it finishes, /link/token/get returns a public token per bank the
 *      person connected; /item/public_token/exchange turns each into an
 *      access token (kept encrypted, server only) and an item id.
 *   3. /transactions/sync, with a cursor, returns what was added, changed or
 *      removed since the last read. Plaid's webhook says when to call it.
 *   4. /item/remove ends the connection (and the consent at the bank).
 */

import type { Fetch } from "./pluggy.ts";

export type PlaidEnvironment = "sandbox" | "production";

const BASE: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  production: "https://production.plaid.com",
};

export interface PlaidConfig {
  clientId: string;
  secret: string;
  environment: PlaidEnvironment;
  /** Tests only. */
  baseUrl?: string;
}

export interface PlaidError {
  error_type?: string;
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
}

export interface PlaidItem {
  item_id: string;
  institution_id?: string | null;
  institution_name?: string | null;
  error: PlaidError | null;
  consent_expiration_time: string | null;
}

export interface PlaidAccount {
  account_id: string;
  name: string;
  official_name?: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { iso_currency_code: string | null; unofficial_currency_code: string | null };
}

export interface PlaidTransaction {
  transaction_id: string;
  account_id: string;
  amount: number;
  iso_currency_code: string | null;
  unofficial_currency_code: string | null;
  date: string;
  datetime?: string | null;
  authorized_datetime?: string | null;
  name: string;
  merchant_name?: string | null;
  original_description?: string | null;
  pending: boolean;
  personal_finance_category?: { primary: string; detailed: string } | null;
  merchant_category_code?: string | null;
}

export class PlaidApiError extends Error {
  constructor(
    readonly status: number,
    readonly error: PlaidError,
  ) {
    super(error.error_code ?? `Plaid answered ${status}`);
    this.name = "PlaidApiError";
  }
}

export class Plaid {
  private readonly base: string;

  constructor(
    private readonly config: PlaidConfig,
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
  ) {
    this.base = (config.baseUrl ?? BASE[config.environment]).replace(/\/+$/, "");
  }

  get environment(): PlaidEnvironment {
    return this.config.environment;
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await this.fetcher(`${this.base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "PLAID-CLIENT-ID": this.config.clientId,
        "PLAID-SECRET": this.config.secret,
        "Plaid-Version": "2020-09-14",
      },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => ({}))) as T & PlaidError;
    if (!res.ok) throw new PlaidApiError(res.status, parsed);
    return parsed;
  }

  /**
   * A Hosted Link session for one person in one country: Plaid's own pages,
   * opened in the system browser; when done Plaid sends the browser to
   * `completionRedirectUri`, which returns to the app. With `accessToken` it
   * reopens an existing connection to fix it (update mode).
   */
  createHostedLink(args: {
    clientUserId: string;
    country: string;
    webhook: string;
    completionRedirectUri: string;
    accessToken?: string;
    language?: string;
  }) {
    return this.post<{ link_token: string; expiration: string; hosted_link_url?: string }>("/link/token/create", {
      client_name: "Flow",
      language: args.language ?? "en",
      country_codes: [args.country],
      user: { client_user_id: args.clientUserId },
      ...(args.accessToken ? { access_token: args.accessToken } : { products: ["transactions"], transactions: { days_requested: 90 } }),
      webhook: args.webhook,
      hosted_link: { completion_redirect_uri: args.completionRedirectUri, is_mobile_app: true, url_lifetime_seconds: 1800 },
    });
  }

  /** The public tokens a finished Link session produced, one per bank connected. */
  async linkResults(linkToken: string): Promise<{ publicToken: string; institution: string | null }[]> {
    const res = await this.post<{
      link_sessions?: { results?: { item_add_results?: { public_token: string; institution?: { name?: string } | null }[] } | null }[];
    }>("/link/token/get", { link_token: linkToken });
    return (res.link_sessions ?? []).flatMap((s) =>
      (s.results?.item_add_results ?? []).map((r) => ({ publicToken: r.public_token, institution: r.institution?.name ?? null })),
    );
  }

  exchange(publicToken: string) {
    return this.post<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token: publicToken });
  }

  async getItem(accessToken: string): Promise<PlaidItem> {
    const res = await this.post<{ item: PlaidItem }>("/item/get", { access_token: accessToken });
    return res.item;
  }

  async institutionName(institutionId: string, country: string): Promise<string | null> {
    try {
      const res = await this.post<{ institution?: { name?: string } }>("/institutions/get_by_id", {
        institution_id: institutionId,
        country_codes: [country],
      });
      return res.institution?.name ?? null;
    } catch {
      return null;
    }
  }

  async accounts(accessToken: string): Promise<PlaidAccount[]> {
    const res = await this.post<{ accounts: PlaidAccount[] }>("/accounts/get", { access_token: accessToken });
    return res.accounts ?? [];
  }

  /**
   * Everything since `cursor` (from the beginning when null), every page.
   * Returns the cursor to store for next time.
   */
  async sync(accessToken: string, cursor: string | null, maxPages = 50) {
    const added: PlaidTransaction[] = [];
    const modified: PlaidTransaction[] = [];
    const removed: { transaction_id: string; account_id: string }[] = [];
    let next = cursor;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.post<{
        added: PlaidTransaction[];
        modified: PlaidTransaction[];
        removed: { transaction_id: string; account_id: string }[];
        next_cursor: string;
        has_more: boolean;
      }>("/transactions/sync", { access_token: accessToken, count: 500, ...(next ? { cursor: next } : {}) });
      added.push(...(res.added ?? []));
      modified.push(...(res.modified ?? []));
      removed.push(...(res.removed ?? []));
      next = res.next_cursor;
      if (!res.has_more) break;
    }
    return { added, modified, removed, cursor: next };
  }

  async removeItem(accessToken: string): Promise<void> {
    try {
      await this.post("/item/remove", { access_token: accessToken });
    } catch (e) {
      // Already gone is what we wanted.
      if (e instanceof PlaidApiError && (e.error.error_code === "ITEM_NOT_FOUND" || e.error.error_code === "INVALID_ACCESS_TOKEN")) return;
      throw e;
    }
  }

  async verificationKey(keyId: string) {
    const res = await this.post<{ key: { kty: string; crv: string; x: string; y: string; kid: string; alg: string; expired_at: number | null } }>(
      "/webhook_verification_key/get",
      { key_id: keyId },
    );
    return res.key;
  }
}
