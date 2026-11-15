/**
 * The App Review demo: a guardian with a family, one adult dependent who has
 * consented, a fictitious bank with two shared accounts, two months of
 * made-up transactions, budgets and alert rules — so a reviewer signed in as
 * the guardian sees every Flow Family screen with something in it, and signed
 * in as the dependent sees the other side.
 *
 * Everything here is fictitious: the bank, the merchants, the amounts. The
 * connection's id starts with "demo-" and never reached Pluggy.
 *
 * Idempotent: running it again tops up the current month and changes nothing
 * else (transaction ids are derived from the month and position).
 *
 * Takes clients rather than creating them, so the same code runs from the
 * command line (seed-demo-family.ts) and in the database tests.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

export interface DemoClients {
  /** Service role. */
  admin: Client;
  /** A client signed in as this user. */
  as(userId: string): Client;
}

export interface DemoIds {
  guardian: string;
  dependent: string;
}

const TERM_VERSION = "2026-11";

async function call<T>(client: Client, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

interface Template {
  day: number;
  merchant: string;
  category: string;
  cents: number;
  direction?: "expense" | "income";
}

/** One month of a teenager-to-young-adult's spending, invented. */
const MONTH: Template[] = [
  { day: 1, merchant: "Salário — Empresa Exemplo", category: "Income", cents: 250000, direction: "income" },
  { day: 2, merchant: "Café Aurora", category: "Eating out", cents: 1890 },
  { day: 3, merchant: "Supermercado Central", category: "Groceries", cents: 18740 },
  { day: 4, merchant: "Transporte App", category: "Transport", cents: 2350 },
  { day: 5, merchant: "Streaming Plus", category: "Entertainment", cents: 3990 },
  { day: 6, merchant: "Farmácia Vida", category: "Health", cents: 5420 },
  { day: 7, merchant: "Lanchonete do Bairro", category: "Eating out", cents: 3200 },
  { day: 8, merchant: "Posto Avenida", category: "Transport", cents: 15000 },
  { day: 9, merchant: "Livraria Saber", category: "Education", cents: 8990 },
  { day: 10, merchant: "Loja Esporte Total", category: "Shopping", cents: 24990 },
  { day: 11, merchant: "Pagamento de fatura", category: "Internal", cents: 120000 },
  { day: 12, merchant: "Aposta Fácil (fictícia)", category: "Betting & lotteries", cents: 5000 },
  { day: 13, merchant: "Pizzaria Napolitana", category: "Eating out", cents: 6780 },
  { day: 14, merchant: "Conta de celular", category: "Housing & bills", cents: 5999 },
  { day: 15, merchant: "Pix para Ana Souza", category: "Transfers", cents: 4000 },
  { day: 16, merchant: "Supermercado Central", category: "Groceries", cents: 9630 },
  { day: 18, merchant: "Cinema Estrela", category: "Entertainment", cents: 4400 },
  { day: 20, merchant: "Transporte App", category: "Transport", cents: 1870 },
  { day: 22, merchant: "Café Aurora", category: "Eating out", cents: 2240 },
  { day: 24, merchant: "Loja de Eletrônicos Exemplo", category: "Shopping", cents: 45990 },
  { day: 26, merchant: "Academia Corpo Ativo", category: "Health", cents: 9900 },
  { day: 28, merchant: "Hamburgueria Central", category: "Eating out", cents: 4590 },
];

function monthEntries(year: number, month: number, now: Date) {
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  return MONTH.map((t, i) => ({ t, i, date: new Date(year, month, t.day, 12 + (i % 8), 15) }))
    .filter(({ date }) => date.getTime() <= now.getTime())
    .map(({ t, i, date }) => ({
      external_id: `demo-${key}-${i}`,
      amount: t.cents,
      direction: t.direction ?? "expense",
      description: t.merchant.toUpperCase(),
      merchant: t.merchant,
      category: t.category,
      date: date.toISOString(),
      // The two most recent purchases are still pending, as at a real bank.
      status: now.getTime() - date.getTime() < 2 * 86_400_000 ? "pending" : "posted",
      currency: "BRL",
    }));
}

export async function seedDemoFamily(c: DemoClients, ids: DemoIds, now: Date = new Date()) {
  const guardian = c.as(ids.guardian);
  const dependent = c.as(ids.dependent);

  // The guardian has a Flow subscription, so the reviewer sees the paid
  // features (more alerts, the PDF report).
  {
    const { error } = await c.admin
      .from("billing")
      .upsert(
        { user_id: ids.guardian, status: "active", current_period_end: new Date(now.getTime() + 365 * 86_400_000).toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(`billing: ${error.message}`);
  }

  // The family.
  let state = await call<{ guardian_of: { family: { id: string }; dependents: { user_id: string }[] } | null }>(guardian, "family_my_state");
  if (!state.guardian_of) {
    await call(guardian, "family_create", { p_name: "Demo Family", p_display_name: "Maria (demo)" });
    state = await call(guardian, "family_my_state");
  }
  const familyId = state.guardian_of!.family.id;

  // The dependent, consented for 12 months.
  if (!state.guardian_of!.dependents.some((d) => d.user_id === ids.dependent)) {
    const invite = await call<{ code: string }>(guardian, "family_invite_create", {
      p_family: familyId,
      p_kind: "adult",
      p_label: "Ana (demo)",
      p_months: 12,
      p_term_version: TERM_VERSION,
    });
    const accepted = await call<{ ok: boolean }>(dependent, "family_invite_accept", {
      p_code: invite.code,
      p_display_name: "Ana (demo)",
      p_term_version: TERM_VERSION,
      p_months: 12,
      p_confirm_adult: true,
    });
    if (!accepted.ok) throw new Error("the demo invitation was not accepted");
  }

  // A fictitious bank. Its id never existed at Pluggy.
  const conn = await call<{ connection_id: string }>(c.admin, "bank_upsert_connection", {
    p_user: ids.dependent,
    p_item: `demo-${ids.dependent}`,
    p_institution: "Banco Demonstração (fictício)",
    p_status: "active",
    p_consent_expires: new Date(now.getTime() + 300 * 86_400_000).toISOString(),
    p_synced: true,
  });
  const accounts = await call<{ id: string; kind: string; shared: boolean }[]>(c.admin, "bank_upsert_accounts", {
    p_connection: conn.connection_id,
    p_accounts: [
      { external_id: "demo-checking", kind: "checking", name: "Conta Corrente Demo", last4: "4321", currency: "BRL" },
      { external_id: "demo-card", kind: "credit_card", name: "Cartão Demo", last4: "9876", currency: "BRL" },
    ],
  });
  for (const a of accounts) {
    if (!a.shared) await call(dependent, "bank_account_set_shared", { p_account: a.id, p_shared: true });
  }

  // Budgets and alert rules first, so this month's recent purchases alert.
  for (const [category, limit] of [
    ["total", 150000],
    ["Eating out", 15000],
    ["Shopping", 40000],
  ] as const) {
    await call(guardian, "family_budget_set", { p_family: familyId, p_dependent: ids.dependent, p_category: category, p_limit: limit });
  }
  await call(guardian, "family_alert_rule_set", { p_family: familyId, p_dependent: ids.dependent, p_kind: "large_purchase", p_enabled: true, p_threshold: 20000 });
  await call(guardian, "family_alert_rule_set", { p_family: familyId, p_dependent: ids.dependent, p_kind: "sensitive_category", p_enabled: true, p_categories: ["Betting & lotteries"] });
  await call(guardian, "family_alert_rule_set", { p_family: familyId, p_dependent: ids.dependent, p_kind: "budget_exceeded", p_enabled: true });

  // Last month and this month so far.
  const checking = accounts.find((a) => a.kind === "checking")!;
  const card = accounts.find((a) => a.kind === "credit_card")!;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const rows = [...monthEntries(prev.getFullYear(), prev.getMonth(), now), ...monthEntries(now.getFullYear(), now.getMonth(), now)];
  const onCard = (r: { category: string }) => ["Shopping", "Entertainment", "Eating out"].includes(r.category);
  let inserted = 0;
  for (const [account, part] of [
    [card, rows.filter(onCard)],
    [checking, rows.filter((r) => !onCard(r))],
  ] as const) {
    const res = await call<{ inserted: number }>(c.admin, "bank_ingest_transactions", { p_account: account.id, p_rows: part });
    inserted += res.inserted;
  }

  return { familyId, connectionId: conn.connection_id, accounts: accounts.length, inserted, total: rows.length };
}
