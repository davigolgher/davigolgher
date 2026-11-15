/**
 * The few calls Flow makes to Salt Edge (banks in the countries Pluggy and
 * Plaid don't cover), over `fetch`.
 *
 * Follows Salt Edge's Account Information API v5 (base
 * https://www.saltedge.com/api/v5, credentials in the App-id and Secret
 * headers, requests signed with the app's RSA key when one is configured).
 * The official documentation couldn't be reached from the environment this
 * was written in; paths and headers match the community `saltedge-api`
 * client (0.0.22). Confirm against Salt Edge's current docs with a test
 * application before going live — see docs/flow-familia/bancos-mundo.md.
 *
 * The flow:
 *   1. One Salt Edge customer per person (bank_customers), created on first use.
 *   2. /connect_sessions/create → a Connect URL the app opens in the system
 *      browser; Salt Edge returns to `return_to` when done.
 *   3. /connections?customer_id lists what the person connected; each
 *      connection's accounts and transactions are read with from_id paging.
 *   4. Salt Edge calls back (success, fail, notify, destroy) signed with its
 *      key; DELETE /connections/:id ends a connection.
 */

import type { Fetch } from "./pluggy.ts";
import { rsaSign } from "./crypto.ts";

export interface SaltEdgeConfig {
  appId: string;
  secret: string;
  /** PKCS#8 PEM. Salt Edge requires signed requests in live mode. */
  privateKeyPem?: string;
  baseUrl?: string;
}

export interface SaltEdgeConnection {
  id: string;
  customer_id: string;
  provider_name?: string;
  provider_code?: string;
  country_code?: string;
  status: string;
  last_success_at?: string | null;
}

export interface SaltEdgeAccount {
  id: string;
  connection_id: string;
  name: string;
  nature: string;
  currency_code: string;
  extra?: { account_number?: string; iban?: string; masked_pan?: string; cards?: string[] } | null;
}

export interface SaltEdgeTransaction {
  id: string;
  account_id: string;
  made_on: string;
  amount: number;
  currency_code: string;
  description: string;
  category?: string | null;
  status?: string | null;
  mode?: string | null;
  duplicated?: boolean;
  extra?: { payee?: string | null; merchant_id?: string | null; posting_date?: string | null } | null;
}

export class SaltEdgeError extends Error {
  constructor(
    readonly status: number,
    readonly errorClass: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "SaltEdgeError";
  }
}

export class SaltEdge {
  private readonly base: string;

  constructor(
    private readonly config: SaltEdgeConfig,
    private readonly fetcher: Fetch = (input, init) => fetch(input, init),
  ) {
    this.base = (config.baseUrl || "https://www.saltedge.com/api/v5").replace(/\/+$/, "");
  }

  private async request<T>(method: string, path: string, query?: Record<string, string | undefined>, body?: unknown): Promise<T> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) params.set(k, v);
    const url = `${this.base}${path}${params.size ? `?${params}` : ""}`;
    const payload = body === undefined ? "" : JSON.stringify(body);
    const headers: Record<string, string> = { Accept: "application/json", "App-id": this.config.appId, Secret: this.config.secret };
    if (payload) headers["Content-Type"] = "application/json";
    if (this.config.privateKeyPem) {
      const expiresAt = String(Math.floor(Date.now() / 1000) + 60);
      headers["Expires-at"] = expiresAt;
      headers.Signature = await rsaSign(this.config.privateKeyPem, `${expiresAt}|${method}|${url}|${payload}`);
    }
    const res = await this.fetcher(url, { method, headers, body: payload || undefined });
    const parsed = (await res.json().catch(() => ({}))) as T & { error?: { class?: string; message?: string } };
    if (!res.ok) throw new SaltEdgeError(res.status, parsed.error?.class, parsed.error?.message ?? `Salt Edge answered ${res.status}`);
    return parsed;
  }

  async createCustomer(identifier: string): Promise<string> {
    const res = await this.request<{ data: { id: string } }>("POST", "/customers", undefined, { data: { identifier } });
    return String(res.data.id);
  }

  /** A customer created earlier whose id wasn't stored (a request cut off halfway). */
  async findCustomer(identifier: string): Promise<string | null> {
    let fromId: string | undefined;
    for (let page = 0; page < 50; page += 1) {
      const res = await this.request<{ data: { id: string; identifier: string }[]; meta?: { next_id?: string | null } }>("GET", "/customers", { from_id: fromId });
      const hit = res.data.find((c) => c.identifier === identifier);
      if (hit) return String(hit.id);
      if (!res.meta?.next_id) return null;
      fromId = String(res.meta.next_id);
    }
    return null;
  }

  /** A Connect URL for this customer (or to reconnect one connection). */
  async connectUrl(args: {
    customerId: string;
    returnTo: string;
    country?: string | null;
    includeFakeProviders?: boolean;
    reconnectConnectionId?: string;
  }): Promise<{ url: string; expiresAt: string }> {
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const consent = { scopes: ["account_details", "transactions_details"], from_date: from };
    const attempt = { return_to: args.returnTo, fetch_scopes: ["accounts", "transactions"] };
    const res = args.reconnectConnectionId
      ? await this.request<{ data: { connect_url: string; expires_at: string } }>("POST", "/connect_sessions/reconnect", undefined, {
          data: { connection_id: args.reconnectConnectionId, consent, attempt },
        })
      : await this.request<{ data: { connect_url: string; expires_at: string } }>("POST", "/connect_sessions/create", undefined, {
          data: {
            customer_id: args.customerId,
            consent,
            attempt,
            daily_refresh: true,
            include_fake_providers: Boolean(args.includeFakeProviders),
            ...(args.country ? { allowed_countries: [args.country] } : {}),
          },
        });
    return { url: res.data.connect_url, expiresAt: res.data.expires_at };
  }

  async connections(customerId: string): Promise<SaltEdgeConnection[]> {
    const res = await this.request<{ data: SaltEdgeConnection[] }>("GET", "/connections", { customer_id: customerId });
    return (res.data ?? []).map((c) => ({ ...c, id: String(c.id), customer_id: String(c.customer_id) }));
  }

  async connection(id: string): Promise<SaltEdgeConnection> {
    const res = await this.request<{ data: SaltEdgeConnection }>("GET", `/connections/${encodeURIComponent(id)}`);
    return { ...res.data, id: String(res.data.id), customer_id: String(res.data.customer_id) };
  }

  async removeConnection(id: string): Promise<void> {
    try {
      await this.request("DELETE", `/connections/${encodeURIComponent(id)}`);
    } catch (e) {
      if (e instanceof SaltEdgeError && e.status === 404) return;
      throw e;
    }
  }

  private async pages<T>(path: string, query: Record<string, string | undefined>, maxPages = 50): Promise<T[]> {
    const all: T[] = [];
    let fromId: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.request<{ data: T[]; meta?: { next_id?: string | null } }>("GET", path, { ...query, from_id: fromId });
      all.push(...(res.data ?? []));
      if (!res.meta?.next_id) break;
      fromId = String(res.meta.next_id);
    }
    return all;
  }

  accounts(connectionId: string) {
    return this.pages<SaltEdgeAccount>("/accounts", { connection_id: connectionId });
  }

  /** Posted and pending transactions of one account. */
  async transactions(connectionId: string, accountId: string): Promise<SaltEdgeTransaction[]> {
    const posted = await this.pages<SaltEdgeTransaction>("/transactions", { connection_id: connectionId, account_id: accountId });
    let pending: SaltEdgeTransaction[] = [];
    try {
      pending = (await this.pages<SaltEdgeTransaction>("/transactions/pending", { connection_id: connectionId, account_id: accountId })).map((t) => ({
        ...t,
        status: "pending",
      }));
    } catch {
      /* not every bank reports pending entries */
    }
    return [...posted, ...pending];
  }
}
