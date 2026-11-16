/**
 * What Home adds so it is never a screen of zeros (docs/produto/zero-moments.md):
 *   · NextStepCard — the one most valuable next thing, by where the person is;
 *   · Insights — one-line facts about their own month, when there is enough
 *     data to say something true;
 *   · WelcomeBack — after a few days away, what happened meanwhile;
 *   · useActivationMoments — records the first expense and the "aha" (the
 *     first time someone sees their own month) once per account.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useOptionalAuth } from "@/features/auth/AuthProvider";
import { needingAttention } from "@/lib/backend/banks";
import { insightsFor, type Insight } from "@/lib/insights";
import { nextStep, type NextStep } from "@/lib/nextStep";
import { useMoney } from "@/lib/useMoney";
import { Button, Card, CONTINUOUS, Eyebrow } from "~/components/ui";
import { BANKS_ENABLED } from "~/features/bank/flag";
import { useBankConnections } from "~/features/bank/useBankConnections";
import { useFoundSubscriptions } from "~/features/subscriptions/useFoundSubscriptions";
import { useFlowFlags } from "~/lib/flow";
import { useReminderPrefs } from "~/lib/notifications";
import { track } from "~/lib/analytics";

const DAY = 86_400_000;

/** Own expenses (not the sample) in the last 30 days. */
function recentExpenseCount(txs: { direction: string; date: string }[], now: Date) {
  return txs.filter((t) => t.direction === "expense" && +now - +new Date(t.date) <= 30 * DAY).length;
}

export function useNextStep(): NextStep | null {
  const { data, now } = useStore();
  const signedIn = Boolean(useOptionalAuth()?.userId);
  const sample = data.isSimulated;
  const banks = useBankConnections(BANKS_ENABLED && signedIn && !sample);
  const { candidates, monthly } = useFoundSubscriptions();
  const money = useMoney();
  const { flags } = useFlowFlags();
  const reminders = useReminderPrefs();
  if (sample) return null;
  const attention = banks.data ? needingAttention(banks.data)[0] : undefined;
  return nextStep({
    recentExpenses: recentExpenseCount(data.transactions, now),
    hasBudget: data.budgets.some((b) => b.scope === "total" && b.limit > 0),
    activeSubscriptions: data.subscriptions.filter((s) => s.status === "active" || s.status === "trial").length,
    foundSubscriptions: candidates.length,
    foundMonthly: candidates.length ? money.format(monthly) : undefined,
    // Banks that can't be reached (the server side not set up, offline with
    // nothing cached) are left out of the suggestions rather than offered.
    banksEnabled: BANKS_ENABLED && !(banks.error && !banks.data),
    bankConnected: banks.data ? banks.data.length > 0 : null,
    bankNeedsAttention: attention ? attention.institution_name || "your bank" : null,
    remindersOn: Boolean(reminders.prefs?.enabled),
    goals: flags?.goals,
  });
}

export function NextStepCard({ step }: { step: NextStep }) {
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (shown.current === step.id) return;
    shown.current = step.id;
    track("next_step_viewed", { kind: step.id });
  }, [step.id]);
  const go = (href: string, alt = false) => {
    track("next_step_tapped", { kind: step.id, via: alt ? "alt" : "main" });
    router.push(href as never);
  };
  return (
    <View
      className={`rounded-card p-5 ${step.tone === "warn" ? "bg-signal-warn-tint" : "bg-ink-800"}`}
      style={CONTINUOUS}
      accessibilityRole="summary"
    >
      <Eyebrow>{step.tone === "warn" ? "Needs you" : "Next step"}</Eyebrow>
      <Text className={`mt-2 text-headline font-semibold ${step.tone === "warn" ? "text-signal-warn" : "text-chalk"}`}>{step.title}</Text>
      <Text className="mt-1.5 text-footnote text-chalk-soft">{step.body}</Text>
      <View className="mt-4 gap-2">
        <Button variant="primary" fullWidth onPress={() => go(step.href)}>
          {step.cta}
        </Button>
        {step.alt ? (
          <Button variant="ghost" fullWidth onPress={() => go(step.alt!.href, true)}>
            {step.alt.cta}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

function insightLine(i: Insight, fmt: (c: number) => string): string {
  switch (i.kind) {
    case "pace":
      return `${fmt(i.amount)} so far — ${fmt(Math.abs(i.delta ?? 0))} ${(i.delta ?? 0) <= 0 ? "less" : "more"} than at this point last month.`;
    case "top_category":
      return `${fmt(i.amount)} on ${i.detail} — ${i.count}% of this month's spending.`;
    case "upcoming":
      return `${fmt(i.amount)} in the next 7 days${i.detail ? "" : ` across ${i.count} subscriptions`}.`;
    case "biggest":
      return `${fmt(i.amount)}${i.detail ? ` at ${i.detail}` : ""}.`;
  }
}

const INSIGHT_LINK: Record<Insight["kind"], string> = { pace: "/reports", top_category: "/reports", upcoming: "/subs", biggest: "/expenses" };

export function Insights() {
  const { data, now } = useStore();
  const money = useMoney();
  const list = useMemo(() => insightsFor(data.transactions, data.subscriptions, now, 2), [data.transactions, data.subscriptions, now]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const i of list) {
      if (seen.current.has(i.kind)) continue;
      seen.current.add(i.kind);
      track("insight_viewed", { kind: i.kind });
    }
  }, [list]);
  if (list.length === 0) return null;
  return (
    <View className="gap-3">
      {list.map((i) => (
        <Card key={i.kind}>
          <Eyebrow>{i.title}</Eyebrow>
          <Text className="mt-2 text-body text-chalk">{insightLine(i, money.format)}</Text>
          <View className="mt-3 self-start">
            <Button variant="secondary" size="sm" onPress={() => router.push(INSIGHT_LINK[i.kind] as never)}>
              {i.kind === "upcoming" ? "See subscriptions" : i.kind === "biggest" ? "See expenses" : "See reports"}
            </Button>
          </View>
        </Card>
      ))}
    </View>
  );
}

/** After 3+ days away: what came in meanwhile. Shown for that visit only. */
export function WelcomeBack() {
  const { data, now } = useStore();
  const { flags, mark } = useFlowFlags();
  const money = useMoney();
  const [since, setSince] = useState<string | null>(null);

  useEffect(() => {
    if (!flags || data.isSimulated) return;
    const last = flags.lastSeenAt;
    const away = last ? Math.floor((+now - +new Date(last)) / DAY) : 0;
    if (last && away >= 3) {
      setSince(last);
      track("returned_after_absence", { days_away: away });
    }
    mark({ lastSeenAt: now.toISOString() });
    // Once per visit to Home, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flags === null]);

  if (!since) return null;
  const fresh = data.transactions.filter((t) => t.direction === "expense" && +new Date(t.date) > +new Date(since));
  const fromBank = fresh.filter((t) => t.source === "bank").length;
  const spent = fresh.reduce((s, t) => s + t.amount, 0);
  const days = Math.floor((+now - +new Date(since)) / DAY);
  return (
    <Card>
      <Eyebrow>Welcome back</Eyebrow>
      <Text className="mt-2 text-body text-chalk">
        {fresh.length > 0
          ? `In the ${days} days you were away: ${fresh.length} expense${fresh.length === 1 ? "" : "s"}${fromBank ? ` (${fromBank} from your bank)` : ""}, ${money.format(spent)} in all.`
          : `It's been ${days} days. Anything to log? It only takes a tap.`}
      </Text>
    </Card>
  );
}

/** The first expense and the first time someone sees their own month: once each, per account. */
export function useActivationMoments() {
  const { data, now } = useStore();
  const { flags, mark } = useFlowFlags();
  useEffect(() => {
    if (!flags || data.isSimulated) return;
    const own = data.transactions.filter((t) => t.direction === "expense");
    if (!flags.firstExpenseAt && own.length > 0) {
      const first = [...own].sort((a, b) => +new Date(a.date) - +new Date(b.date))[0];
      track("first_expense_added", { source: first.source ?? "manual" });
      mark({ firstExpenseAt: now.toISOString() });
    }
    // The aha: Home showing at least three of their own expenses from the
    // last 30 days, enough for a month that means something.
    const recent = own.filter((t) => +now - +new Date(t.date) <= 30 * DAY);
    if (!flags.ahaAt && recent.length >= 3) {
      const bank = recent.filter((t) => t.source === "bank").length;
      track("aha_reached", { via: bank === 0 ? "manual" : bank === recent.length ? "bank" : "mixed", count: recent.length });
      mark({ ahaAt: now.toISOString() });
    }
  }, [flags, data.transactions, data.isSimulated, mark, now]);
}
