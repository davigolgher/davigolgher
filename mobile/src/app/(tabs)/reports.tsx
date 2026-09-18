/** Reports — ported from the web ReportsScreen: monthly bars, category donut, subscription costs. */
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { activeSubscriptions, subscriptionsMonthlyTotal, totalThisMonth } from "@/lib/calc";
import { categoryBreakdown, monthlyTotals } from "@/lib/reports";
import { FREQUENCY_LABEL } from "@/lib/recurrence";
import { Eyebrow, ScreenHeader } from "~/components/ui";
import { Donut } from "~/components/Donut";

function BarRow({ label, value, barPct }: { label: string; value: string; barPct: number }) {
  return (
    <View className="py-2.5">
      <View className="flex-row items-center gap-3">
        <Text numberOfLines={1} className="min-w-0 flex-1 text-[14px] text-chalk">
          {label}
        </Text>
        <Text className="shrink-0 text-[14px] font-semibold text-chalk">{value}</Text>
      </View>
      <View className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-ink-750">
        <View className="h-full rounded-pill bg-chalk" style={{ width: `${Math.max(2, Math.min(100, barPct))}%` }} />
      </View>
    </View>
  );
}

export default function Reports() {
  const insets = useSafeAreaInsets();
  const { data, now } = useStore();
  const money = useMoney();

  const spent = totalThisMonth(data.transactions, now);
  const categories = useMemo(() => categoryBreakdown(data.transactions, now), [data.transactions, now]);
  const months = useMemo(
    () => monthlyTotals(data.transactions, money.locale, 6),
    [data.transactions, money.locale],
  );
  const subs = activeSubscriptions(data.subscriptions);
  const subsMonthly = subscriptionsMonthlyTotal(data.subscriptions);

  const maxMonth = Math.max(1, ...months.map((m) => m.total));
  const maxSub = Math.max(1, ...subs.map((s) => s.amount));

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
    >
      <ScreenHeader eyebrow={`${money.format(spent)} spent this month`} title="Reports" />

      <View className="mt-6">
        <Eyebrow>Monthly spending</Eyebrow>
        {months.some((m) => m.total > 0) ? (
          <View className="mt-1">
            {months.map((m) => (
              <BarRow key={m.key} label={m.label} value={money.format(m.total)} barPct={(m.total / maxMonth) * 100} />
            ))}
          </View>
        ) : (
          <Text className="py-6 text-[15px] text-chalk-mute">No spending recorded yet.</Text>
        )}
      </View>

      <View className="mt-8">
        <Eyebrow>Spending by category</Eyebrow>
        <View className="mt-3">
          {categories.length > 0 ? (
            <Donut slices={categories} />
          ) : (
            <Text className="py-6 text-[15px] text-chalk-mute">No spending yet.</Text>
          )}
        </View>
      </View>

      <View className="mt-8">
        <Eyebrow>Subscription costs</Eyebrow>
        {subs.length > 0 ? (
          <View className="mt-1">
            <Text className="mb-1 text-[13px] text-chalk-mute">{money.format(subsMonthly)} per month in total</Text>
            {subs.map((s) => (
              <BarRow
                key={s.id}
                label={`${s.name} · ${FREQUENCY_LABEL[s.frequency]}`}
                value={money.format(s.amount)}
                barPct={(s.amount / maxSub) * 100}
              />
            ))}
          </View>
        ) : (
          <View className="mt-3 rounded-card border border-dashed border-line-strong p-5">
            <Text className="text-center text-[14px] text-chalk-mute">No active subscriptions.</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
