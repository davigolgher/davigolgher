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

      {all.length > 0 ? (
        <FadeIn className="mt-5" delay={60}>
          {all.map((t) => (
            <ExpenseRow key={t.id} transaction={t} />
          ))}
          <Text className="mt-3 text-[12px] text-chalk-mute">Tap to edit · press and hold to delete.</Text>
        </FadeIn>
      ) : (
        <Text className="mt-8 text-[15px] leading-relaxed text-chalk-mute">
          Nothing logged yet. Tap Add to record what you spent — or switch to Income to record money that came in.
        </Text>
      )}
    </ScrollView>
  );
}
