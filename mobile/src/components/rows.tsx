/** Transaction row, mirroring the web app's ExpenseRow. */
import { Alert, Pressable, Text, View } from "react-native";
import type { Transaction } from "@/data/types";
import { formatDateMedium, formatRelativeDay } from "@/lib/format";
import { useMoney } from "@/lib/useMoney";
import { useStore } from "@/data/store";

export function ExpenseRow({ transaction: t, onPress }: { transaction: Transaction; onPress?: () => void }) {
  const money = useMoney();
  const { deleteTransaction } = useStore();
  const income = t.direction === "income";

  // Default tap action: show what was logged, with a way to remove it. Without
  // this the row looks tappable and isn't, and a logged expense can never be
  // taken back.
  const showDetails = () => {
    Alert.alert(
      t.description,
      [
        `${income ? "Income" : "Expense"} · ${money.format(t.amount)}`,
        t.merchant ? `Paid to ${t.merchant}` : null,
        `Category: ${t.categoryId || "Uncategorized"}`,
        formatDateMedium(t.date),
        t.note ? `\n${t.note}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
      [
        { text: "Close", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteTransaction(t.id) },
      ],
    );
  };

  return (
    <Pressable
      onPress={onPress ?? showDetails}
      className="flex-row items-center gap-3 border-b border-line-soft py-3.5 active:opacity-60"
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
          {t.description}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-[13px] text-chalk-mute">
          {[t.merchant || t.categoryId, formatRelativeDay(t.date)].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {/* Monochrome by design: the sign carries the direction, not colour. */}
      <Text className="shrink-0 text-[15px] font-semibold text-chalk">
        {income ? "+" : "−"}
        {money.format(t.amount)}
      </Text>
    </Pressable>
  );
}
