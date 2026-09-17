/**
 * Reports. The category breakdown is real (shared `categoryBreakdown`); the
 * donut chart and monthly trend come next, with react-native-svg.
 */
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { totalThisMonth } from "@/lib/calc";
import { categoryBreakdown } from "@/lib/reports";
import { Eyebrow, ScreenHeader } from "~/components/ui";

export default function Reports() {
  const insets = useSafeAreaInsets();
  const { data, now } = useStore();
  const money = useMoney();

  const spent = totalThisMonth(data.transactions, now);
  const slices = categoryBreakdown(data.transactions, now);

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
    >
      <ScreenHeader eyebrow="Breakdown" title="Reports" />

      <View className="mt-6 rounded-card border border-line bg-ink-850 p-5">
        <Eyebrow>Spent this month</Eyebrow>
        <Text className="mt-2 text-[34px] font-bold leading-none tracking-tight text-chalk">{money.format(spent)}</Text>
      </View>

      <View className="mt-6">
        <Eyebrow>By category</Eyebrow>
        {slices.length > 0 ? (
          <View className="mt-2">
            {slices.map((s) => (
              <View key={s.category} className="border-b border-line-soft py-3.5">
                <View className="flex-row items-center gap-3">
                  <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] text-chalk">
                    {s.category}
                  </Text>
                  <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(s.total)}</Text>
                  <Text className="w-10 shrink-0 text-right text-[13px] text-chalk-mute">{s.pct}%</Text>
                </View>
                <View className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-ink-750">
                  <View className="h-full rounded-pill bg-chalk" style={{ width: `${Math.max(2, s.pct)}%` }} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text className="py-6 text-[15px] leading-relaxed text-chalk-mute">
            Log a few expenses and the breakdown shows up here.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
