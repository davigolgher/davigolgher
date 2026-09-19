/** Subscriptions. Reads the shared store; the add/edit flow is ported next. */
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { Money } from "@/lib/money";
import { daysUntil, monthlyEquivalent } from "@/lib/recurrence";
import { formatDaysUntil } from "@/lib/format";
import { Eyebrow, ScreenHeader, StatCard } from "~/components/ui";

export default function Subs() {
  const insets = useSafeAreaInsets();
  const { data, now } = useStore();
  const money = useMoney();

  const active = data.subscriptions.filter((s) => s.status === "active" || s.status === "trial");
  const monthly = Money.sum(active.map((s) => monthlyEquivalent(s)));
  const upcoming = [...active].sort((a, b) => +new Date(a.nextChargeAt) - +new Date(b.nextChargeAt));

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
    >
      <ScreenHeader eyebrow="Recurring" title="Subscriptions" />

      <View className="mt-6 flex-row gap-4">
        <StatCard label="Per month" value={money.format(monthly)} sub={`${active.length} active`} />
        <StatCard label="Per year" value={money.format(Money.scale(monthly, 12))} sub="Annualised" />
      </View>

      <View className="mt-6">
        <Eyebrow>Upcoming</Eyebrow>
        {upcoming.length > 0 ? (
          <View className="mt-1">
            {upcoming.map((s) => (
              <View key={s.id} className="flex-row items-center gap-3 border-b border-line-soft py-3.5">
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
                    {s.name}
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-chalk-mute">
                    {formatDaysUntil(daysUntil(s.nextChargeAt, now))}
                  </Text>
                </View>
                <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(s.amount)}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="py-6 text-[15px] leading-relaxed text-chalk-mute">
            No subscriptions tracked yet.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
