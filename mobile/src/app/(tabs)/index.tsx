/**
 * Home — the month at a glance, and never a screen of zeros.
 *
 * Above the numbers: what needs the person (a bank to reconnect) or the one
 * most valuable next step for where they are (connect a bank, a first
 * expense, subscriptions Flow found, a budget…). Under them: insights about
 * their own month once there's enough to say something true, and "welcome
 * back" after a few days away. While exploring the sample month, a banner
 * says so on top.
 */
import { useEffect, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { Money } from "@/lib/money";
import { availableThisMonth, incomeThisMonth, savingsThisMonth, totalThisMonth } from "@/lib/calc";
import { Button, Card, Eyebrow, FadeIn, FitNumber, Pill, ScreenHeader, StatCard } from "~/components/ui";
import { PlusIcon } from "~/components/icons";
import { StreakCard } from "~/components/StreakCard";
import { ExpenseRow } from "~/components/rows";
import { SyncNotice } from "~/components/SyncNotice";
import { useTabScreenPadding } from "~/lib/screen";
import { FAMILY_ENABLED } from "~/features/family/flag";
import { FamilyHomeCard } from "~/features/family/HomeCard";
import { SampleBanner } from "~/features/sample/SampleMode";
import { Insights, NextStepCard, useActivationMoments, useNextStep, WelcomeBack } from "~/features/home/HomeGuide";
import { track } from "~/lib/analytics";

export default function Home() {
  const padding = useTabScreenPadding();
  const { data, now } = useStore();
  const money = useMoney();

  const txs = data.transactions;
  const spent = totalThisMonth(txs, now);
  const income = incomeThisMonth(txs, now);
  const savings = savingsThisMonth(txs, now);
  const budget = data.budgets.find((b) => b.scope === "total")?.limit ?? 0;
  const hasBudget = budget > 0;

  // What's left counts income, not just the budget: money that arrived this
  // month is money you can spend, and leaving it out made the headline number
  // answer a question nobody was asking.
  const available = availableThisMonth(txs, budget, now);
  const pot = Money.add(budget, income);
  const over = available < 0;
  const pct = pot > 0 ? Math.min(100, Math.round((spent / pot) * 100)) : 0;
  const status = !hasBudget ? "No budget" : over ? "Over budget" : pct >= 80 ? "Almost there" : "On track";

  const recent = useMemo(
    () => [...txs].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5),
    [txs],
  );
  const step = useNextStep();
  useActivationMoments();
  useEffect(() => track("home_viewed", { screen: data.isSimulated ? "sample" : "account" }), [data.isSimulated]);
  // Income and savings mean something only for someone who records income.
  const recordsIncome = txs.some((t) => t.direction === "income");

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={padding}
    >
      <ScreenHeader
        eyebrow="Overview"
        title="This month"
        action={
          <Button
            variant="primary"
            size="sm"
            pill
            leadingIcon={<PlusIcon size={16} color="#FFFFFF" strokeWidth={2.2} />}
            onPress={() => router.push("/add-expense")}
          >
            Add
          </Button>
        }
      />

      <SampleBanner />
      <SyncNotice />

      {/* Flow Family builds: who this person shares with, or the people they follow. */}
      {FAMILY_ENABLED ? <FamilyHomeCard /> : null}

      {step ? (
        <FadeIn className="mt-6" delay={30}>
          <NextStepCard step={step} />
        </FadeIn>
      ) : null}

      {/* Budget hero — big number, status pill, spend progress. */}
      <FadeIn className="mt-6" delay={60}>
        <Card>
          <View className="flex-row items-center justify-between gap-3">
            <Eyebrow>{hasBudget ? "Left to spend" : "Spent this month"}</Eyebrow>
            <Pill>{status}</Pill>
          </View>
          <FitNumber className="mt-5 text-[44px] font-bold leading-none tracking-tight text-chalk">
            {money.format(hasBudget ? available : spent)}
          </FitNumber>
          <Text className="mt-2 text-[13px] text-chalk-mute">
            {!hasBudget
              ? "No monthly budget yet"
              : income > 0
                ? `${money.format(budget)} budget + ${money.format(income)} income − ${money.format(spent)} spent`
                : `${money.format(spent)} spent of ${money.format(budget)}`}
          </Text>
          {hasBudget ? (
            <View className="mt-4 h-1.5 w-full overflow-hidden rounded-pill bg-ink-750">
              <View className="h-full rounded-pill bg-chalk" style={{ width: `${Math.max(3, pct)}%` }} />
            </View>
          ) : step?.id !== "set_budget" ? (
            <View className="mt-4 self-start">
              <Button variant="secondary" size="sm" onPress={() => router.push("/budget")}>
                Set a budget
              </Button>
            </View>
          ) : null}
        </Card>
      </FadeIn>

      {recordsIncome ? (
        <FadeIn className="mt-4 flex-row gap-4" delay={120}>
          <StatCard label="Income" value={money.format(income)} sub="Received" />
          <StatCard
            label="Savings"
            value={money.format(savings)}
            sub={savings < 0 ? "Spending over income" : "Income − spending"}
          />
        </FadeIn>
      ) : null}

      <FadeIn className="mt-4 gap-3" delay={150}>
        <WelcomeBack />
        <Insights />
      </FadeIn>

      {/* The streak means something once there is one. */}
      {data.activeDays.length > 0 ? (
        <FadeIn className="mt-4" delay={180}>
          <StreakCard />
        </FadeIn>
      ) : null}

      <FadeIn className="mt-6" delay={240}>
        <Eyebrow>Recent</Eyebrow>
        {recent.length > 0 ? (
          <View className="mt-1">
            {recent.map((t) => (
              <ExpenseRow key={t.id} transaction={t} />
            ))}
          </View>
        ) : (
          <Text className="py-6 text-[15px] text-chalk-mute">
            Your latest expenses appear here{step?.id === "connect_bank" ? ", by themselves once your bank is connected" : ""}.
          </Text>
        )}
      </FadeIn>
    </ScrollView>
  );
}
