/** All transactions, newest first. */
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { totalThisMonth } from "@/lib/calc";
import { Button, ScreenHeader } from "~/components/ui";
import { PlusIcon } from "~/components/icons";
import { ExpenseRow } from "~/components/rows";

export default function Expenses() {
  const insets = useSafeAreaInsets();
  const { data, now } = useStore();
  const money = useMoney();

  const all = useMemo(
    () => [...data.transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [data.transactions],
  );

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
    >
      <ScreenHeader
        eyebrow={`${money.format(totalThisMonth(data.transactions, now))} this month`}
        title="Expenses"
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
        <View className="mt-5">
          {all.map((t) => (
            <ExpenseRow key={t.id} transaction={t} />
          ))}
        </View>
      ) : (
        <Text className="mt-8 text-[15px] leading-relaxed text-chalk-mute">
          Nothing logged yet. Tap Add to record your first expense.
        </Text>
      )}
    </ScrollView>
  );
}
