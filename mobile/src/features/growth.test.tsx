/**
 * The first minutes and the screens that must never be empty: the welcome
 * and the sample month, onboarding, Home's next step and the "aha", the
 * subscriptions found in someone's spending, and the bank screen in each of
 * its states. Rendered whole (React Native as DOM), with the real store and
 * fakes for the server.
 */
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import type { AppData, Transaction } from "@/data/types";

vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});
vi.mock("react-native", () => import("../../../src/test/stubs/react-native-dom"));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock("react-native-svg", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <>{children ?? null}</>;
  return { default: Pass, Svg: Pass, G: Pass, Path: () => null, Circle: () => null, Rect: () => null, Line: () => null, Polyline: () => null };
});
vi.mock("react-native-pluggy-connect", () => ({ PluggyConnect: () => <div>Pluggy Connect</div> }));
const locale = vi.hoisted(() => ({ currencyCode: "USD" }));
vi.mock("expo-localization", () => ({ getLocales: () => [{ regionCode: "US", currencyCode: locale.currencyCode, languageTag: "en-US" }] }));
const browser = vi.hoisted(() => ({ openAuthSessionAsync: vi.fn(async () => ({ type: "success", url: "flow://bank-return?provider=plaid" })) }));
vi.mock("expo-web-browser", () => browser);

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => true) }));
vi.mock("expo-router", async () => {
  const { useEffect } = await import("react");
  return {
    router: nav,
    Stack: Object.assign(({ children }: { children?: ReactNode }) => <>{children}</>, { Screen: () => null }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

const USER = "11111111-1111-4111-8111-111111111111";
const who = vi.hoisted(() => ({ userId: "11111111-1111-4111-8111-111111111111" as string | null }));
vi.mock("@/features/auth/AuthProvider", () => ({
  useAuth: () => ({ userId: who.userId, configured: true, email: "maria@example.test", session: who.userId ? {} : null }),
  useOptionalAuth: () => ({ userId: who.userId, configured: true }),
}));

const flags = vi.hoisted(() => ({
  value: { onboardingDone: true, tutorialDone: true } as Record<string, unknown>,
  mark: vi.fn(),
}));
vi.mock("~/lib/flow", () => ({ useFlowFlags: () => ({ flags: flags.value, mark: flags.mark }) }));
vi.mock("~/lib/notifications", () => ({ useReminderPrefs: () => ({ prefs: { enabled: false } }) }));
const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("~/lib/analytics", () => analytics);
vi.mock("~/lib/haptics", () => ({ hapticSelection: () => {}, hapticSuccess: () => {}, hapticHold: () => {} }));
const features = vi.hoisted(() => ({ banks: true }));
vi.mock("~/features/bank/flag", () => ({
  get BANKS_ENABLED() {
    return features.banks;
  },
}));
vi.mock("~/features/family/flag", () => ({ FAMILY_ENABLED: false }));
// The streak card is animated with native modules; its own tests cover it.
vi.mock("~/components/StreakCard", () => ({ StreakCard: () => <div>Streak card</div> }));

const kv = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => kv.get(k) ?? null,
    setItem: async (k: string, v: string) => void kv.set(k, v),
    removeItem: async (k: string) => void kv.delete(k),
  },
}));

const bank = vi.hoisted(() => ({
  list: vi.fn(async (): Promise<unknown[]> => []),
  coverage: vi.fn(async () => ({ providers: { pluggy: true, plaid: true, saltedge: true } })),
  connectToken: vi.fn(async (_t: unknown): Promise<unknown> => ({ provider: "plaid", url: "https://hosted.plaid.test/link/x", session: "s1", returnUrl: "flow://bank-return" })),
  sync: vi.fn(async (_t: unknown) => ({ status: "active", accounts: 2, inserted: 0 })),
  setImport: vi.fn(async () => ({ import: true, imported: 0 })),
  importDefaults: vi.fn(async () => ({ imported_accounts: 2, other_accounts: 0 })),
  disconnect: vi.fn(async () => ({ removed: true, providerPending: false })),
}));
vi.mock("@/lib/backend/banks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend/banks")>();
  return { ...actual, bankApi: bank };
});

const { StoreProvider, useStore } = await import("@/data/store");
const { createInitialData } = await import("@/data/mock");
const { createSampleData } = await import("@/data/sample");
const { Alert } = await import("react-native");
const Home = (await import("~/app/(tabs)/index")).default;
const Subs = (await import("~/app/(tabs)/subs")).default;
const Banks = (await import("~/app/banks/index")).default;
const { OnboardingScreen } = await import("~/features/OnboardingScreen");
const { WelcomeScreen } = await import("~/features/WelcomeScreen");
const { SampleModeProvider, useSampleMode } = await import("~/features/sample/SampleMode");
const { forgetBankConnections } = await import("~/features/bank/useBankConnections");

const NOW = Date.now();
const DAY = 86_400_000;
let seq = 0;
const expense = (daysAgo: number, merchant: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id: `t${++seq}`,
  amount,
  direction: "expense",
  description: merchant,
  merchant,
  categoryId: "Eating out",
  date: new Date(NOW - daysAgo * DAY).toISOString(),
  currency: "USD",
  ...over,
});
const withData = (over: Partial<AppData> = {}): AppData => ({ ...createInitialData(), ...over });
const wrap = (ui: React.JSX.Element, seed: AppData = withData()) =>
  render(
    <StoreProvider seed={seed} simulateLoading={false}>
      {ui}
    </StoreProvider>,
  );
const tracked = (name: string) => analytics.track.mock.calls.filter((c) => c[0] === name);

beforeEach(() => {
  vi.clearAllMocks();
  kv.clear();
  who.userId = USER;
  features.banks = true;
  flags.value = { onboardingDone: true, tutorialDone: true };
  bank.list.mockResolvedValue([]);
  forgetBankConnections();
});

describe("first minute", () => {
  it("the welcome offers the sample month before any form, and the sample is labelled everywhere", async () => {
    function Shell() {
      const { data, entry } = useSampleMode();
      return (
        <StoreProvider sample={data} simulateLoading={false}>
          {data ? <Home /> : <WelcomeScreen />}
          <span>{`entry:${entry}`}</span>
        </StoreProvider>
      );
    }
    who.userId = null;
    render(
      <SampleModeProvider>
        <Shell />
      </SampleModeProvider>,
    );
    expect(screen.getByText("See where your money goes.")).toBeInTheDocument();
    expect(tracked("welcome_viewed")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Explore with sample data" }));

    expect(await screen.findByText("Sample data")).toBeInTheDocument();
    expect(tracked("sample_started")).toHaveLength(1);
    // A filled-in month, not zeros, and no "next step" nagging over the sample.
    expect(screen.getAllByText(/StreamBox|Corner Café|Fresh Market|Bookshop|Sneaker Store|Burger Joint|Ride app/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Next step")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Make it mine" }));
    expect(await screen.findByText("entry:signUp")).toBeInTheDocument();
  });

  it("onboarding asks one question, the budget only of those who want one, and leaves categories ready", async () => {
    const done = vi.fn();
    function Probe() {
      const { data } = useStore();
      return <span>{`categories:${data.categories.length}`}</span>;
    }
    wrap(
      <>
        <OnboardingScreen onDone={done} />
        <Probe />
      </>,
    );
    expect(screen.getByText("What do you want Flow to do for you?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Keep track of subscriptions" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(done).toHaveBeenCalledWith(["subscriptions"]);
    expect(screen.getByText("categories:8")).toBeInTheDocument();
    expect(tracked("onboarding_completed")[0][1]).toMatchObject({ goals: "subscriptions" });

    done.mockClear();
    wrap(<OnboardingScreen onDone={done} />);
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Stay within a monthly budget" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Continue" })[0]);
    expect(await screen.findByText("What's your monthly budget?")).toBeInTheDocument();
    expect(done).not.toHaveBeenCalled();
  });
});

describe("a new account in its own currency", () => {
  it("finishing onboarding with nothing logged adopts the phone's currency", async () => {
    locale.currencyCode = "BRL";
    function Probe() {
      const { data } = useStore();
      return <span>{`currency:${data.preferences.currency}`}</span>;
    }
    wrap(
      <>
        <OnboardingScreen onDone={() => {}} />
        <Probe />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText("currency:BRL")).toBeInTheDocument();
    locale.currencyCode = "USD";
  });
});

describe("Home is never a screen of zeros", () => {
  it("a new account with banks on is offered its last 90 days first, typing second", async () => {
    wrap(<Home />);
    expect(await screen.findByText("See your last 90 days in a minute")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Connect your bank" }));
    expect(nav.push).toHaveBeenCalledWith("/banks");
    expect(screen.getByRole("button", { name: "Add an expense by hand" })).toBeInTheDocument();
    expect(tracked("next_step_viewed")[0][1]).toEqual({ kind: "connect_bank" });
    // No streak of zero days, no income of zero for someone who never logged any.
    expect(screen.queryByText("Streak card")).not.toBeInTheDocument();
    expect(screen.queryByText("Income")).not.toBeInTheDocument();
  });

  it("without banks, the first step is a first expense", async () => {
    features.banks = false;
    wrap(<Home />);
    expect(await screen.findByText("Log your first expense")).toBeInTheDocument();
  });

  it("three of their own expenses this month: the aha is recorded once, and the next step moves on", async () => {
    wrap(<Home />, withData({ transactions: [expense(1, "Café", 450), expense(2, "Market", 6200), expense(3, "Bus", 300)] }));
    await waitFor(() => expect(tracked("aha_reached")).toHaveLength(1));
    expect(tracked("aha_reached")[0][1]).toMatchObject({ via: "manual", count: 3 });
    expect(flags.mark).toHaveBeenCalledWith(expect.objectContaining({ ahaAt: expect.any(String) }));
    expect(await screen.findByText("Set a monthly budget")).toBeInTheDocument();
  });

  it("a bank that needs the person comes first", async () => {
    bank.list.mockResolvedValue([{ id: "c1", institution_name: "Banco X", status: "needs_attention", provider: "pluggy", external_item_id: "i1", accounts: [] }]);
    wrap(<Home />, withData({ transactions: [expense(1, "Café", 450)] }));
    expect(await screen.findByText("Reconnect Banco X")).toBeInTheDocument();
  });
});

describe("subscriptions found in spending", () => {
  it("offers charges that repeat every month; tracking one adds it, dismissing one removes it", async () => {
    const txs = [
      expense(62, "Netflix", 1599, { categoryId: "Entertainment" }),
      expense(31, "Netflix", 1599, { categoryId: "Entertainment" }),
      expense(1, "Netflix", 1599, { categoryId: "Entertainment" }),
      expense(58, "CloudDrive", 299, { categoryId: "Other" }),
      expense(28, "CloudDrive", 299, { categoryId: "Other" }),
    ];
    wrap(<Subs />, withData({ transactions: txs }));
    expect(screen.getByText("Found in your spending")).toBeInTheDocument();
    expect(tracked("subscription_suggestion_viewed")[0][1]).toEqual({ count: 2 });

    fireEvent.click(screen.getAllByRole("button", { name: "Track it" })[0]);
    expect(tracked("subscription_suggestion_accepted")).toHaveLength(1);
    // Netflix is now tracked (it's in "Upcoming"), and only CloudDrive is offered.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Track it" })).toHaveLength(1));
    expect(screen.getByText("Upcoming")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Not a subscription" }));
    await waitFor(() => expect(screen.queryByText("Found in your spending")).not.toBeInTheDocument());
  });
});

describe("the bank screen", () => {
  it("with no bank: what it gets you, the promises, and a way to say not now", async () => {
    wrap(<Banks />);
    expect(await screen.findByText("Your bank, in Flow")).toBeInTheDocument();
    expect(screen.getByText("Your last 90 days, right away")).toBeInTheDocument();
    expect(screen.getByText("The subscriptions you forgot")).toBeInTheDocument();
    expect(screen.getByText("Your password never reaches Flow")).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not now — I'll add expenses myself" }));
    expect(nav.back).toHaveBeenCalled();
    expect(tracked("bank_intro_viewed")).toHaveLength(1);
  });

  it("connecting: the provider's page, then every account in my currency comes in, and I'm told what arrived", async () => {
    const fresh = {
      id: "c9",
      institution_name: "First Platypus Bank",
      status: "active",
      provider: "plaid",
      external_item_id: "item-9",
      country_code: "US",
      last_synced_at: null,
      accounts: [{ id: "a1", kind: "checking", name: "Checking", last4: "0000", currency: "USD", shared: false, shared_at: null, import_to_flow: false }],
    };
    wrap(<Banks />);
    const go = await screen.findByRole("button", { name: "Connect a bank in United States" });
    bank.list.mockResolvedValue([fresh]);
    bank.sync.mockResolvedValueOnce({ status: "active", accounts: 1, inserted: 0 }).mockResolvedValueOnce({ status: "active", accounts: 1, inserted: 42 });
    await act(async () => {
      fireEvent.click(go);
    });
    expect(bank.connectToken).toHaveBeenCalledWith({ country: "US" });
    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith("https://hosted.plaid.test/link/x", "flow://bank-return");
    await waitFor(() => expect(bank.importDefaults).toHaveBeenCalledWith("c9", "USD"));
    expect(bank.sync).toHaveBeenLastCalledWith({ connectionId: "c9" });
    expect(await screen.findByText("42 purchases are now in Flow")).toBeInTheDocument();
    expect(tracked("bank_import_completed")[0][1]).toEqual({ banks: 1, entries: 42 });
    fireEvent.click(screen.getByRole("button", { name: "See your month" }));
    expect(nav.replace).toHaveBeenCalledWith("/");
  });

  it("someone with nothing in Flow yet takes their first bank's currency, so it brings everything in", async () => {
    const fresh = {
      id: "c7",
      institution_name: "Banco Exemplo",
      status: "active",
      provider: "pluggy",
      external_item_id: "item-7",
      country_code: "BR",
      last_synced_at: null,
      accounts: [{ id: "a7", kind: "checking", name: "Conta", last4: "4321", currency: "BRL", shared: false, shared_at: null, import_to_flow: false }],
    };
    function Currency() {
      const { data } = useStore();
      return <span>{`currency:${data.preferences.currency}`}</span>;
    }
    wrap(
      <>
        <Banks />
        <Currency />
      </>,
    );
    const go = await screen.findByRole("button", { name: "Connect a bank in United States" });
    bank.list.mockResolvedValue([fresh]);
    await act(async () => {
      fireEvent.click(go);
    });
    await waitFor(() => expect(bank.importDefaults).toHaveBeenCalledWith("c7", "BRL"));
    expect(screen.getByText("currency:BRL")).toBeInTheDocument();
  });

  it("a connection needing the person says so and offers to reconnect; disconnecting asks what to keep", async () => {
    const conn = {
      id: "c1",
      institution_name: "Banco X",
      status: "expired",
      provider: "pluggy",
      external_item_id: "item-1",
      country_code: "BR",
      last_synced_at: new Date().toISOString(),
      accounts: [{ id: "a1", kind: "credit_card", name: "Cartão", last4: "9876", currency: "USD", shared: false, shared_at: null, import_to_flow: true }],
    };
    bank.list.mockResolvedValue([conn]);
    wrap(<Banks />);
    expect(await screen.findByText("Banco X: Consent expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect" })).toBeInTheDocument();
    expect(screen.getByText("In your Flow")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Disconnect this bank"));
    const buttons = vi.mocked(Alert.alert).mock.calls[0][2] as { text: string; onPress?: () => void }[];
    expect(buttons.map((b) => b.text)).toEqual(["Disconnect, keep expenses", "Disconnect and delete them", "Cancel"]);
    await act(async () => buttons[1].onPress?.());
    expect(bank.disconnect).toHaveBeenCalledWith("c1", false);
    expect(tracked("bank_disconnected")[0][1]).toEqual({ kept: false });
  });

  it("while exploring the sample, it asks for an account instead", async () => {
    who.userId = null;
    wrap(<Banks />, createSampleData("USD"));
    expect(await screen.findByRole("button", { name: "Create my account" })).toBeInTheDocument();
    expect(bank.list).not.toHaveBeenCalled();
  });

  it("if banks can't be reached, Home falls back to typing an expense", async () => {
    bank.list.mockRejectedValue(new Error("unavailable"));
    wrap(<Home />);
    expect(await screen.findByText("Log your first expense")).toBeInTheDocument();
  });
});
