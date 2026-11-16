/** All transactions, newest first. */
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { totalThisMonth } from "@/lib/calc";
import { Button, FadeIn, ScreenHeader } from "~/components/ui";
import { PlusIcon } from "~/components/icons";
import { ExpenseRow } from "~/components/rows";
import { useTabScreenPadding } from "~/lib/screen";
import { SampleBanner } from "~/features/sample/SampleMode";
import { BANKS_ENABLED } from "~/features/bank/flag";

export default function Expenses() {
  const padding = useTabScreenPadding();
  const { data, now } = useStore();
  const money = useMoney();

  const all = useMemo(
    () => [...data.transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [data.transactions],
  );

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={padding}
    >
      <ScreenHeader
        eyebrow={`${money.format(totalThisMonth(data.transactions, now))} spent this month`}
        title="Expenses & income"
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

      {all.length > 0 ? (
        <FadeIn className="mt-5" delay={60}>
          {all.map((t) => (
            <ExpenseRow key={t.id} transaction={t} />
          ))}
          <Text className="mt-3 text-[12px] text-chalk-mute">Tap to edit · press and hold to delete.</Text>
        </FadeIn>
      ) : (
        <View className="mt-8 rounded-card border border-dashed border-line-strong p-6">
          <Text className="text-center text-[15px] font-semibold text-chalk">Nothing logged yet</Text>
          <Text className="mt-2 text-center text-[14px] leading-relaxed text-chalk-mute">
            {BANKS_ENABLED
              ? "Connect your bank and your last 90 days arrive here, sorted into categories. Or add an expense yourself: an amount and a tap."
              : "Add what you spend: an amount and a tap. Income works the same way, from the switch at the top."}
          </Text>
          <View className="mt-4 items-center gap-2">
            {BANKS_ENABLED && !data.isSimulated ? (
              <Button variant="primary" size="sm" onPress={() => router.push("/banks")}>
                Connect your bank
              </Button>
            ) : null}
            <Button variant={BANKS_ENABLED && !data.isSimulated ? "ghost" : "primary"} size="sm" onPress={() => router.push("/add-expense")}>
              Add an expense
            </Button>
          </View>
        </View>
      )}
    </ScrollView>
  );
}
