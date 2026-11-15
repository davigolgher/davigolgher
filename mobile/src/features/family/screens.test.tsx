/**
 * Flow Family's screens, rendered whole: the front door, the consent screen,
 * the dependent's Sharing page, the guardian's dashboard and the Home card —
 * in their loading, empty, error, offline and "access ended" states.
 *
 * React Native renders as DOM (src/test/stubs/react-native-dom), the server
 * is a set of fakes behind the real data client's interface, and the real
 * FamilyProvider holds the state, so what's checked is what a person — or a
 * screen reader — would meet.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { BankEntry, FamilyState } from "@/lib/backend/family";
import { CONSENT_TERM_VERSION } from "@/lib/family/consentTerm";

vi.mock("react-native", () => import("../../../../src/test/stubs/react-native-dom"));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-svg", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children ?? null}</>;
  return { default: Pass, Svg: Pass, G: Pass, Path: () => null, Circle: () => null, Rect: () => null };
});
vi.mock("react-native-pluggy-connect", () => ({ PluggyConnect: () => <div>Pluggy Connect</div> }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ regionCode: "US" }] }));
const browser = vi.hoisted(() => ({ openAuthSessionAsync: vi.fn(async () => ({ type: "success", url: "flow://family/bank-return?provider=plaid" })) }));
vi.mock("expo-web-browser", () => browser);

const nav = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  dismissAll: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: { push: nav.push, replace: nav.replace, back: nav.back, dismissAll: nav.dismissAll },
    Stack: Object.assign(({ children }: { children?: ReactNode }) => <>{children}</>, { Screen: () => null }),
    Redirect: ({ href }: { href: string }) => {
      nav.redirect(href);
      return null;
    },
    useLocalSearchParams: () => nav.params,
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const USER = "11111111-1111-4111-8111-111111111111";
vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ userId: USER, configured: true, email: "ana@example.test" }) }));

const api = vi.hoisted(() => ({
  myState: vi.fn(),
  alerts: vi.fn(async (): Promise<unknown[]> => []),
  previewInvite: vi.fn(),
  acceptInvite: vi.fn(),
  myConnections: vi.fn(async (): Promise<unknown[]> => []),
  aboutMe: vi.fn(async () => ({ rules: [], budgets: [] })),
  activity: vi.fn(async (): Promise<unknown[]> => []),
  revokeConsent: vi.fn(async () => undefined),
  transactions: vi.fn(async () => [] as BankEntry[]),
  overview: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  setTimeZone: vi.fn(async (_tz: string) => undefined),
  bankCoverage: vi.fn(async () => ({ providers: { pluggy: true, plaid: true, saltedge: true } })),
  connectToken: vi.fn(async (_target: unknown): Promise<unknown> => ({})),
  syncConnection: vi.fn(async (_target: unknown) => ({ status: "active", accounts: 2, inserted: 0, connections: 1 })),
}));
vi.mock("@/lib/backend/family", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend/family")>();
  return { ...actual, familyApi: api };
});

const store = vi.hoisted(() => new Map<string, { savedAt: string; data: unknown }>());
vi.mock("./cache", () => ({
  readCache: async (u: string, k: string) => store.get(`${u}.${k}`) ?? null,
  writeCache: async (u: string, k: string, data: unknown) => {
    store.set(`${u}.${k}`, { savedAt: new Date().toISOString(), data });
    return new Date().toISOString();
  },
  dropCache: async (u: string, k: string) => void store.delete(`${u}.${k}`),
  clearAllCaches: async () => store.clear(),
}));
vi.mock("./push", () => ({ registerForAlerts: vi.fn(async () => "registered"), unregisterPush: vi.fn(), signOutOfFamily: vi.fn() }));
vi.mock("./files", () => ({ shareMyData: vi.fn(), shareReportPdf: vi.fn() }));
vi.mock("~/lib/haptics", () => ({ hapticSelection: () => {}, hapticSuccess: () => {}, hapticHold: () => {} }));
vi.mock("./flag", () => ({ FAMILY_ENABLED: true }));

const { FamilyError } = await import("@/lib/backend/family");
const { Alert } = await import("react-native");
const { FamilyProvider } = await import("./FamilyProvider");
const { FamilyHomeCard } = await import("./HomeCard");
const FamilyHome = (await import("~/app/family/index")).default;
const Consent = (await import("~/app/family/consent")).default;
const Sharing = (await import("~/app/family/sharing")).default;
const Dashboard = (await import("~/app/family/dependent/[id]")).default;
const Connect = (await import("~/app/family/connect")).default;

const DEP = "22222222-2222-4222-8222-222222222222";
const GUARDIAN = "33333333-3333-4333-8333-333333333333";
const future = new Date(Date.now() + 200 * 86_400_000).toISOString();

const empty: FamilyState = { user_id: USER, plan: "free", term_version: CONSENT_TERM_VERSION, guardian_of: null, dependent_of: [] };

const guardianState: FamilyState = {
  ...empty,
  guardian_of: {
    family: { id: "fam-1", name: "The Silvas", created_at: new Date().toISOString() },
    display_name: "Maria",
    plan: "free",
    dependents: [
      {
        user_id: DEP,
        display_name: "Ana",
        kind: "adult",
        joined_at: new Date().toISOString(),
        locked: false,
        consent: { id: "c1", status: "active", given_by: "self", term_version: CONSENT_TERM_VERSION, months: 12, granted_at: new Date().toISOString(), expires_at: future, ended_at: null, end_reason: null },
      },
      { user_id: "44444444-4444-4444-8444-444444444444", display_name: "Leo", kind: "minor", joined_at: new Date().toISOString(), locked: true, consent: null },
    ],
    invites: [],
  },
};

const dependentState: FamilyState = {
  ...empty,
  dependent_of: [
    {
      family: { id: "fam-1", name: "The Silvas" },
      display_name: "Ana",
      kind: "adult",
      can_self_consent: true,
      joined_at: new Date().toISOString(),
      guardians: [{ user_id: GUARDIAN, display_name: "Maria", email: "m***@example.test" }],
      consent: { id: "c1", status: "active", given_by: "self", term_version: CONSENT_TERM_VERSION, months: 12, granted_at: new Date().toISOString(), expires_at: future, ended_at: null, end_reason: null, guardian_id: GUARDIAN },
    },
  ],
};

const wrap = (ui: ReactNode) => render(<FamilyProvider familyOnly={false}>{ui}</FamilyProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  nav.params = {};
  api.alerts.mockResolvedValue([]);
  api.myConnections.mockResolvedValue([]);
  api.aboutMe.mockResolvedValue({ rules: [], budgets: [] });
  api.activity.mockResolvedValue([]);
  api.subscribe.mockReturnValue(() => {});
});

describe("front door", () => {
  it("explains the feature and offers both ways in when there's no family", async () => {
    api.myState.mockResolvedValue(empty);
    wrap(<FamilyHome />);
    expect(await screen.findByRole("heading", { name: "Flow Family" })).toBeInTheDocument();
    expect(screen.getByText(/can't move money, block purchases or see bank passwords/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I have an invitation code" }));
    expect(nav.push).toHaveBeenCalledWith("/family/join");
  });

  it("lists a guardian's people, and says when one is locked by the free plan", async () => {
    api.myState.mockResolvedValue(guardianState);
    api.alerts.mockResolvedValue([{ id: "a1", read_at: null }, { id: "a2", read_at: null }] as never);
    wrap(<FamilyHome />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText(/Locked on the free plan/)).toBeInTheDocument();
    expect(await screen.findByText("2 new")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ana"));
    expect(nav.push).toHaveBeenCalledWith(`/family/dependent/${DEP}`);
  });

  it("offline, shows the last copy saved on this phone and says so", async () => {
    store.set(`${USER}.state`, { savedAt: "2026-11-14T10:00:00.000Z", data: guardianState });
    api.myState.mockRejectedValue(new FamilyError("network"));
    wrap(<FamilyHome />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("with nothing saved and no connection, offers to try again", async () => {
    api.myState.mockRejectedValue(new FamilyError("network"));
    wrap(<FamilyHome />);
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    api.myState.mockResolvedValue(empty);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Flow Family" })).toBeInTheDocument();
  });
});

describe("consent", () => {
  const preview = {
    found: true,
    family_name: "The Silvas",
    guardian_name: "Maria",
    guardian_email: "m***@example.test",
    kind: "adult" as const,
    label: "Ana",
    months: 6,
    term_version: CONSENT_TERM_VERSION,
    expires_at: future,
  };

  it("says what, with whom and for how long, and records nothing until both boxes are ticked", async () => {
    nav.params = { code: "ABCD2345" };
    api.myState.mockResolvedValue(empty);
    api.previewInvite.mockResolvedValue(preview);
    api.acceptInvite.mockResolvedValue({ ok: true, family_id: "fam-1" });
    wrap(<Consent />);

    expect(await screen.findByRole("heading", { name: "Share your spending with Maria?" })).toBeInTheDocument();
    expect(screen.getByText(`Version ${CONSENT_TERM_VERSION}`)).toBeInTheDocument();
    expect(screen.getByText("What is never shared")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "6 months" })).toHaveAttribute("aria-checked", "true");

    const agree = screen.getByRole("button", { name: "Agree and continue" });
    expect(agree).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /18 or older/ }));
    expect(agree).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I've read what is shared/ }));
    fireEvent.click(screen.getByRole("radio", { name: "3 months" }));
    expect(agree).toBeEnabled();

    await act(async () => fireEvent.click(agree));
    expect(api.acceptInvite).toHaveBeenCalledWith({
      code: "ABCD2345",
      displayName: "Ana",
      termVersion: CONSENT_TERM_VERSION,
      months: 3,
      confirmAdult: true,
      birthdate: null,
    });
    expect(nav.push).toHaveBeenCalledWith("/family/connect");
  });

  it("won't take consent to terms this version of the app doesn't show", async () => {
    nav.params = { code: "ABCD2345" };
    api.myState.mockResolvedValue(empty);
    api.previewInvite.mockResolvedValue({ ...preview, term_version: "2099-01" });
    wrap(<Consent />);
    expect(await screen.findByText("Update Flow to continue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /18 or older/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /I've read what is shared/ }));
    expect(screen.getByRole("button", { name: "Agree and continue" })).toBeDisabled();
  });
});

describe("the dependent's Sharing page", () => {
  it("shows who can see, who looked, and stops sharing on confirmation", async () => {
    api.myState.mockResolvedValue(dependentState);
    api.activity.mockResolvedValue([
      { id: 1, family_id: "fam-1", actor_id: GUARDIAN, actor_name: "Maria", subject_id: USER, action: "viewed_transactions", detail: {}, created_at: new Date().toISOString() },
    ]);
    api.myConnections.mockResolvedValue([
      {
        id: "conn-1",
        external_item_id: "item-1",
        institution_name: "Banco Fictício",
        status: "active",
        status_detail: null,
        consent_expires_at: null,
        last_synced_at: null,
        orphaned_at: null,
        created_at: new Date().toISOString(),
        accounts: [{ id: "acc-1", kind: "checking", name: "Conta", last4: "4321", currency: "BRL", shared: true, shared_at: null }],
      },
    ]);
    wrap(<Sharing />);

    expect(await screen.findByText("Maria viewed your spending")).toBeInTheDocument();
    expect(screen.getByText("Can see")).toBeInTheDocument();
    expect(await screen.findByText("Account •••• 4321 · Banco Fictício")).toBeInTheDocument();
    expect(screen.getByText(/Your bank password/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
    expect(Alert.alert).toHaveBeenCalled();
    const buttons = vi.mocked(Alert.alert).mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
    await act(async () => buttons.find((b) => b.text === "Stop sharing")!.onPress!());
    expect(api.revokeConsent).toHaveBeenCalledWith("fam-1");
  });
});

describe("the guardian's dashboard", () => {
  const now = new Date();
  const thisMonth = (day: number) => new Date(now.getFullYear(), now.getMonth(), day, 12).toISOString();
  const entry = (over: Partial<BankEntry>): BankEntry => ({
    id: Math.random().toString(36),
    account_id: "acc-1",
    amount: 1000,
    direction: "expense",
    description: "Compra",
    merchant: null,
    category: "Eating out",
    date: thisMonth(1),
    status: "posted",
    currency: "BRL",
    ...over,
  });

  it("totals the month, splits it by category, filters by one, and leaves internal moves out", async () => {
    nav.params = { id: DEP };
    api.myState.mockResolvedValue(guardianState);
    api.overview.mockResolvedValue({
      accounts: [{ id: "acc-1", name: "Conta", kind: "checking", last4: "4321", currency: "BRL", institution: "Banco Fictício", locked: false }],
      connections: [{ id: "conn-1", institution: "Banco Fictício", status: "expired", consent_expires_at: null, last_synced_at: null }],
      budgets: [{ category: "Eating out", limit: 2000 }],
      rules: [],
    });
    api.transactions.mockResolvedValue([
      entry({ merchant: "Padaria Estrela", amount: 2590 }),
      entry({ merchant: "Uber", amount: 1500, category: "Transport" }),
      entry({ description: "PAGAMENTO DE FATURA", amount: 90000, category: "Internal" }),
    ]);
    wrap(<Dashboard />);

    expect(await screen.findByText("Padaria Estrela")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s40,90/)).toBeInTheDocument();
    expect(screen.getByText("Banco Fictício: Consent expired")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Eating out budget" })).toHaveAttribute("aria-label", "Eating out budget");
    expect(screen.getByText(/not counted/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Transport/ }));
    expect(screen.queryByText("Padaria Estrela")).not.toBeInTheDocument();
    expect(screen.getByText("Uber")).toBeInTheDocument();
  });

  it("when sharing has ended, shows that and none of the data", async () => {
    nav.params = { id: DEP };
    api.myState.mockResolvedValue(guardianState);
    store.set(`${USER}.feed-${DEP}`, { savedAt: new Date().toISOString(), data: [entry({ merchant: "Old secret" })] });
    api.overview.mockRejectedValue(new FamilyError("no_access"));
    api.transactions.mockRejectedValue(new FamilyError("no_access"));
    wrap(<Dashboard />);
    expect(await screen.findByText("Sharing ended")).toBeInTheDocument();
    await waitFor(() => expect(store.has(`${USER}.feed-${DEP}`)).toBe(false));
    expect(screen.queryByText("Old secret")).not.toBeInTheDocument();
  });
});

describe("connecting a bank abroad", () => {
  it("asks where the bank is, opens the provider's page in the secure browser, then reads what was connected", async () => {
    api.myState.mockResolvedValue(dependentState);
    api.connectToken.mockResolvedValue({ provider: "plaid", url: "https://hosted.plaid.test/link/abc", session: "11111111-2222-4333-8444-555555555555", returnUrl: "flow://family/bank-return" });
    wrap(<Connect />);

    expect(await screen.findByRole("heading", { name: "Where is your bank?" })).toBeInTheDocument();
    // The phone's country first, with the provider named.
    const rows = await screen.findAllByText(/^Through /);
    expect(rows[0].parentElement?.textContent).toBe("United StatesThrough Plaid");
    fireEvent.click(screen.getByRole("button", { name: "Connect a bank in United States" }));

    await waitFor(() => expect(api.syncConnection).toHaveBeenCalledWith({ session: "11111111-2222-4333-8444-555555555555" }));
    expect(api.connectToken).toHaveBeenCalledWith({ country: "US" });
    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith("https://hosted.plaid.test/link/abc", "flow://family/bank-return");
    expect(await screen.findByText(/Connected — 2 accounts found/)).toBeInTheDocument();
  });
});

describe("Home card", () => {
  it("always tells a dependent who they share with", async () => {
    api.myState.mockResolvedValue(dependentState);
    wrap(<FamilyHomeCard />);
    expect(await screen.findByText("Shared with Maria")).toBeInTheDocument();
    // A dependent's phone tells the server its time zone, once.
    await waitFor(() => expect(api.setTimeZone).toHaveBeenCalledTimes(1));
    expect(api.setTimeZone.mock.calls[0][0]).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    fireEvent.click(screen.getByRole("button", { name: /shared with Maria/ }));
    expect(nav.push).toHaveBeenCalledWith("/family/sharing");
  });

  it("shows nothing to someone in no family, or without the feature", async () => {
    api.myState.mockResolvedValue(empty);
    const { container } = wrap(<FamilyHomeCard />);
    await waitFor(() => expect(api.myState).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    const bare = render(<FamilyHomeCard />);
    expect(bare.container).toBeEmptyDOMElement();
  });
});
