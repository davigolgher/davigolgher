/**
 * Banks in Flow itself: connect your own bank and its purchases become your
 * expenses (0017). The connection machinery is the same one Flow Family uses
 * (one aggregator per region, the server holding every key), so this only
 * adds what is personal: which accounts go into Flow, and whether to keep
 * what was imported when disconnecting.
 */
import { familyApi, invoke, rpc, type BankLinkStart, type ConnectionStatus, type MyConnection } from "./family";

export type BankConnection = MyConnection;
export type { BankLinkStart, ConnectionStatus };

export const bankApi = {
  /** Which providers this server can open, to offer the right countries. */
  coverage: familyApi.bankCoverage,
  /** Open a new connection in a country, or a stored one to fix it. */
  connectToken: familyApi.connectToken,
  /** Read a connection (new or stored): its state, accounts and new entries. */
  sync: familyApi.syncConnection,
  /** My connections and their accounts, with what is shared and what is imported. */
  list: familyApi.myConnections,
  /** Bring one account into my Flow, or stop (what was imported stays). */
  setImport: (accountId: string, on: boolean) =>
    rpc<{ import: boolean; imported: number }>("bank_account_set_import", { p_account: accountId, p_import: on }),
  /** Right after connecting: import every account in my Flow currency. */
  importDefaults: (connectionId: string, currency: string) =>
    rpc<{ imported_accounts: number; other_accounts: number }>("bank_connection_import_defaults", {
      p_connection: connectionId,
      p_currency: currency,
    }),
  /** End a connection at the provider; keep or delete what it brought into Flow. */
  disconnect: (connectionId: string, keepImported: boolean) =>
    invoke<{ removed: boolean; providerPending: boolean }>("bank-connection-delete", { connectionId, keepImported }),
};

/** What a connection's state means for the person's own Flow, and what to do. */
export const BANK_HINT: Record<ConnectionStatus, string> = {
  active: "Purchases arrive within minutes of your bank reporting them.",
  updating: "Your bank is sending the latest purchases.",
  needs_attention: "Your bank needs you to sign in again. Until then, new purchases don't arrive.",
  expired: "The consent you gave at your bank ended. Reconnect to keep purchases coming in.",
  error: "Your bank isn't answering. It usually recovers on its own; reconnect if it doesn't.",
};

/** Accounts of a connection that are neither shared nor imported: just connected, nothing chosen yet. */
export function untouched(c: BankConnection): boolean {
  return c.accounts.length > 0 && c.accounts.every((a) => !a.shared && !a.import_to_flow);
}

/** Is anything of mine coming in from banks, or about to? */
export function importing(connections: BankConnection[]): boolean {
  return connections.some((c) => c.accounts.some((a) => a.import_to_flow));
}

/** The connections that need the person to do something at their bank. */
export function needingAttention(connections: BankConnection[]): BankConnection[] {
  return connections.filter((c) => c.status === "needs_attention" || c.status === "expired" || c.status === "error");
}
