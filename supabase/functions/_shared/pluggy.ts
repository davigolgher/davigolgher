/**
 * The few calls Flow makes to Pluggy, the Open Finance aggregator.
 *
 * A small client over `fetch` rather than Pluggy's SDK: the SDK is a Node
 * library (it uses `got`) and these functions run on Deno, and Flow needs six
 * endpoints, read-only. Paths and shapes follow pluggy-sdk 0.94 (its types are
 * the reference used here: Item, Account, Transaction, the v2 transactions
 * cursor and the connect token).
 *
 * The client id and secret exist only as Edge Function secrets. They are
 * exchanged for a short-lived API key (`POST /auth`), which is cached for the
 * life of the function instance and renewed when Pluggy says it expired.
 * Nothing here is ever sent to the app except a connect token, which only
 * opens the connection widget for one user.
 */

export interface PluggyConfig {
  clientId: string;
  clientSecret: string;
  baseUrl?: string;
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface PluggyItem {
  id: string;
  status: string;
  executionStatus?: string | null;
  clientUserId?: string | null;
  consentExpiresAt?: string | null;
  error?: { code?: string; message?: string } | null;
  connector?: { id?: number; name?: string; isOpenFinance?: boolean } | null;
  lastUpdatedAt?: string | null;
}

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: string;
  subtype?: string | null;
  number?: string | null;
  name?: string | null;
  marketingName?: string | null;
  currencyCode?: string | null;
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description?: string | null;
  type?: "DEBIT" | "CREDIT" | string | null;
  amount: number;
  amountInAccountCurrency?: number | null;
  currencyCode?: string | null;
  category?: string | null;
  categoryId?: string | null;
  status?: "PENDING" | "POSTED" | string | null;
  merchant?: { name?: string | null; businessName?: string | null; category?: string | null } | null;
  creditCardMetadata?: { payeeMCC?: number | null } | null;
}

export class PluggyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PluggyError";
  }
}

const enc = encodeURIComponent;

export class Pluggy {
  private apiKey: string | null = null;
  private readonly base: string;

  constructor(
    private readonly config: PluggyConfig,
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
  ) {
    this.base = (config.baseUrl || "https://api.pluggy.ai").replace(/\/+$/, "");
  }

  private async authenticate(): Promise<string> {
    const res = await this.fetcher(`${this.base}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ clientId: this.config.clientId, clientSecret: this.config.clientSecret, nonExpiring: false }),
    });
    const body = (await res.json().catch(() => ({}))) as { apiKey?: string; message?: string };
    if (!res.ok || !body.apiKey) throw new PluggyError(body.message ?? "Pluggy authentication failed", res.status, "auth");
    this.apiKey = body.apiKey;
    return body.apiKey;
  }

  private async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const key = this.apiKey ?? (await this.authenticate());
    const res = await this.fetcher(`${this.base}/${path}`, {
      method,
      headers: {
        "X-API-KEY": key,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // An API key lasts a couple of hours; a warm function instance can outlive it.
    if (res.status === 401 && !retried) {
      this.apiKey = null;
      return this.request<T>(method, path, body, true);
    }
    if (res.status === 204) return undefined as T;
    const parsed = (await res.json().catch(() => null)) as (T & { message?: string; code?: string }) | null;
    if (!res.ok) throw new PluggyError(parsed?.message ?? `Pluggy ${method} ${path.split("?")[0]} failed`, res.status, parsed?.code);
    return parsed as T;
  }

  /**
   * A token that lets the app open Pluggy Connect for one user. `itemId`
   * reopens an existing connection (to renew consent or fix credentials)
   * instead of creating a new one.
   */
  async createConnectToken(options: { clientUserId: string; itemId?: string; webhookUrl?: string; oauthRedirectUri?: string }) {
    const res = await this.request<{ accessToken: string }>("POST", "connect_token", {
      itemId: options.itemId,
      options: {
        clientUserId: options.clientUserId,
        webhookUrl: options.webhookUrl,
        oauthRedirectUri: options.oauthRedirectUri,
        avoidDuplicates: true,
      },
    });
    return res.accessToken;
  }

  getItem(itemId: string) {
    return this.request<PluggyItem>("GET", `items/${enc(itemId)}`);
  }

  /** Ends the connection at Pluggy, which also ends the consent with the bank. */
  async deleteItem(itemId: string): Promise<void> {
    try {
      await this.request<unknown>("DELETE", `items/${enc(itemId)}`);
    } catch (e) {
      // Already gone is what we wanted.
      if (e instanceof PluggyError && e.status === 404) return;
      throw e;
    }
  }

  async listAccounts(itemId: string): Promise<PluggyAccount[]> {
    const res = await this.request<{ results?: PluggyAccount[] }>("GET", `accounts?itemId=${enc(itemId)}`);
    return res.results ?? [];
  }

  /**
   * Transactions of one account, every page, through the v2 cursor.
   * `dateFrom` and `createdAtFrom` are mutually exclusive at Pluggy; `ids`
   * fetches specific ones (500 at most per request).
   */
  async listTransactions(
    accountId: string,
    filter: { dateFrom?: string; createdAtFrom?: string; ids?: string[] } = {},
    maxPages = 50,
  ): Promise<PluggyTransaction[]> {
    const params = new URLSearchParams({ accountId });
    if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
    if (filter.createdAtFrom) params.set("createdAtFrom", filter.createdAtFrom);
    if (filter.ids?.length) params.set("ids", filter.ids.slice(0, 500).join(","));

    const all: PluggyTransaction[] = [];
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.request<{ results?: PluggyTransaction[]; next?: string | null }>("GET", `v2/transactions?${params}`);
      all.push(...(res.results ?? []));
      // Only the cursor is taken from `next`: the request always goes to our
      // own base URL, never to a URL a response handed us.
      const after = res.next ? new URL(res.next, this.base).searchParams.get("after") : null;
      if (!after) break;
      params.set("after", after);
    }
    return all;
  }
}

export function pluggyFromEnv(env: { pluggyClientId: string; pluggyClientSecret: string; pluggyBaseUrl?: string }, fetcher?: Fetch): Pluggy | null {
  if (!env.pluggyClientId || !env.pluggyClientSecret) return null;
  return new Pluggy({ clientId: env.pluggyClientId, clientSecret: env.pluggyClientSecret, baseUrl: env.pluggyBaseUrl }, fetcher);
}
