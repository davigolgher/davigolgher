/**
 * The reminders switch, end to end in JavaScript: permission, the saved
 * preference, and what gets scheduled. iOS itself is faked.
 */
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Subscription } from "@/data/types";

const h = vi.hoisted(() => ({
  storage: new Map<string, string>(),
  permission: { granted: true, canAskAgain: true },
  prompted: 0,
  scheduled: [] as { content: { title: string; body: string } }[],
  subscriptions: [] as unknown[],
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => h.storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void h.storage.set(k, v),
    removeItem: async (k: string) => void h.storage.delete(k),
  },
}));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: () => {},
  SchedulableTriggerInputTypes: { DATE: "date", TIME_INTERVAL: "timeInterval" },
  getPermissionsAsync: async () => ({ ...h.permission }),
  requestPermissionsAsync: async () => {
    h.prompted += 1;
    return { ...h.permission };
  },
  getAllScheduledNotificationsAsync: async () =>
    h.scheduled.map((n, i) => ({ identifier: String(i), content: { ...n.content, data: { tag: "flow.renewal" } } })),
  cancelScheduledNotificationAsync: async () => {
    h.scheduled = [];
  },
  scheduleNotificationAsync: async (req: { content: { title: string; body: string } }) => {
    h.scheduled.push(req);
    return String(h.scheduled.length);
  },
}));

vi.mock("@/features/auth/AuthProvider", () => ({ useAuth: () => ({ userId: "user-a" }) }));
vi.mock("@/data/store", () => ({ useStore: () => ({ data: { subscriptions: h.subscriptions } }) }));
vi.mock("@/lib/useMoney", () => ({ useMoney: () => ({ format: (c: number) => `$${(c / 100).toFixed(2)}` }) }));
vi.mock("@/lib/backend/billing", () => ({ fetchBilling: async () => null }));

const { RemindersProvider, useRenewalReminders } = await import("./reminders");
type R = ReturnType<typeof useRenewalReminders>;

function mount() {
  const ref: { current: R | null } = { current: null };
  function Probe() {
    ref.current = useRenewalReminders();
    return null;
  }
  render(
    <RemindersProvider>
      <Probe />
    </RemindersProvider>,
  );
  return () => ref.current as R;
}

const settle = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

const netflix: Subscription = {
  id: "s1",
  name: "Netflix",
  amount: 1599,
  currency: "USD",
  frequency: "monthly",
  nextChargeAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  status: "active",
  categoryId: "Subscriptions",
  reminders: true,
};

beforeEach(() => {
  h.storage.clear();
  h.permission = { granted: true, canAskAgain: true };
  h.prompted = 0;
  h.scheduled = [];
  h.subscriptions = [netflix];
});

describe("the reminders switch", () => {
  it("starts off, then turns on and schedules once notifications are allowed", async () => {
    const r = mount();
    await settle();
    expect(r().prefs?.enabled).toBe(false);

    let ok = false;
    await act(async () => {
      ok = await r().setEnabled(true);
    });
    await settle();

    expect(ok).toBe(true);
    expect(r().prefs?.enabled).toBe(true);
    expect(JSON.parse(h.storage.get("flow.reminders.v2.user-a") ?? "{}").enabled).toBe(true);
    expect(r().scheduled).toBe(1);
    expect(h.scheduled[0].content.title).toBe("Netflix renews in 2 days");
    expect(h.scheduled[0].content.body).not.toContain("$15.99"); // amounts off by default
  });

  it("asks iOS once when it can, and stays off if refused", async () => {
    h.permission = { granted: false, canAskAgain: true };
    const r = mount();
    await settle();
    let ok = true;
    await act(async () => {
      ok = await r().setEnabled(true);
    });
    expect(h.prompted).toBe(1);
    expect(ok).toBe(false);
    expect(r().prefs?.enabled).toBe(false);
  });

  it("doesn't prompt again after a denial — the screen points to iOS Settings instead", async () => {
    h.permission = { granted: false, canAskAgain: false };
    const r = mount();
    await settle();
    let ok = true;
    await act(async () => {
      ok = await r().setEnabled(true);
    });
    expect(h.prompted).toBe(0);
    expect(ok).toBe(false);
  });

  it("turning it off cancels what was scheduled", async () => {
    const r = mount();
    await settle();
    await act(async () => {
      await r().setEnabled(true);
    });
    await settle();
    expect(h.scheduled).toHaveLength(1);
    await act(async () => {
      await r().setEnabled(false);
    });
    await settle();
    expect(r().prefs?.enabled).toBe(false);
    expect(h.scheduled).toHaveLength(0);
  });
});
