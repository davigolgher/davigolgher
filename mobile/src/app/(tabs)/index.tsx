/** Home — ported from the web app's HomeScreen, same data and same layout. */
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { Money } from "@/lib/money";
import { availableThisMonth, incomeThisMonth, savingsThisMonth, totalThisMonth } from "@/lib/calc";
import { Button, Eyebrow, FadeIn, FitNumber, Pill, ScreenHeader, StatCard } from "~/components/ui";
import { PlusIcon } from "~/components/icons";
import { useFocusTick } from "~/lib/useFocusTick";
import { StreakCard } from "~/components/StreakCard";
import { ExpenseRow } from "~/components/rows";

export default function Home() {
  const insets = useSafeAreaInsets();
  const tick = useFocusTick();
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

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
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

      {/* Budget hero — big number, status pill, spend progress. */}
      <FadeIn className="mt-6 rounded-card border border-line bg-ink-850 p-5" delay={60} trigger={tick}>
        <View className="flex-row items-center justify-between gap-3">
          <Eyebrow>{hasBudget ? "Left to spend" : "Spent this month"}</Eyebrow>
          <Pill>{status}</Pill>
        </View>
        <FitNumber className="mt-5 text-[44px] font-bold leading-none tracking-tight text-chalk">
          {money.format(hasBudget ? available : spent)}
        </FitNumber>
        <Text className="mt-2 text-[13px] text-chalk-mute">
          {!hasBudget
            ? "Set a monthly budget in Settings"
            : income > 0
              ? `${money.format(budget)} budget + ${money.format(income)} income − ${money.format(spent)} spent`
              : `${money.format(spent)} spent of ${money.format(budget)}`}
        </Text>
        {hasBudget ? (
          <View className="mt-4 h-1.5 w-full overflow-hidden rounded-pill bg-ink-750">
            <View className="h-full rounded-pill bg-chalk" style={{ width: `${Math.max(3, pct)}%` }} />
          </View>
        ) : null}
      </FadeIn>

      <FadeIn className="mt-4 flex-row gap-4" delay={120} trigger={tick}>
        <StatCard label="Income" value={money.format(income)} sub="Received" />
        <StatCard
          label="Savings"
          value={money.format(savings)}
          sub={savings < 0 ? "Spending over income" : "Income − spending"}
        />
      </FadeIn>

      <FadeIn className="mt-4" delay={180} trigger={tick}>
        <StreakCard />
      </FadeIn>

      <FadeIn className="mt-6" delay={240} trigger={tick}>
        <Eyebrow>Recent</Eyebrow>
        {recent.length > 0 ? (
          <View className="mt-1">
            {recent.map((t) => (
              <ExpenseRow key={t.id} transaction={t} />
            ))}
          </View>
        ) : (
          <Text className="py-6 text-[15px] text-chalk-mute">No transactions yet. Add one to get started.</Text>
        )}
      </FadeIn>
    </ScrollView>
  );
}
