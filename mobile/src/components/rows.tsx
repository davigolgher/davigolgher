/**
 * Transaction row: tap to edit, press and hold to delete.
 *
 * Laid out like an iOS list cell: 17pt text, a separator that starts where the
 * text does, and a grey highlight edge to edge while it's held. The row runs
 * into the screen's 24pt margins (`-mx-6`) so the highlight does too.
 *
 * Press-and-hold can't be discovered with VoiceOver, so delete is also offered
 * as a custom action (swipe up or down on the row, then double-tap).
 */
import { Alert, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import type { Transaction } from "@/data/types";
import { formatRelativeDay } from "@/lib/format";
import { useMoney } from "@/lib/useMoney";
import { useStore } from "@/data/store";
import { hapticHold } from "~/lib/haptics";

export function ExpenseRow({ transaction: t }: { transaction: Transaction }) {
  const money = useMoney();
  const { deleteTransaction } = useStore();
  const income = t.direction === "income";

  const confirmDelete = () => {
    Alert.alert(`Delete "${t.description}"?`, `${money.format(t.amount)} · this can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteTransaction(t.id) },
    ]);
  };

  const meta = [t.merchant || t.categoryId, formatRelativeDay(t.date)].filter(Boolean).join(" · ");

  return (
    <Pressable
      onPress={() => router.push(`/add-expense?id=${t.id}`)}
      onLongPress={() => {
        hapticHold();
        confirmDelete();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${t.description}, ${income ? "income" : "expense"} ${money.format(t.amount)}, ${meta}`}
      accessibilityHint="Opens it to edit."
      accessibilityActions={[{ name: "delete", label: "Delete" }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "delete") confirmDelete();
      }}
      className="-mx-6 px-6 active:bg-ink-800"
    >
      <View className="flex-row items-center gap-3 border-b border-line-soft py-3">
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="text-[17px] text-chalk">
            {t.description}
          </Text>
          <Text numberOfLines={1} className="mt-0.5 text-[14px] text-chalk-mute">
            {meta}
          </Text>
        </View>
        {/* Monochrome by design: the sign carries the direction, not colour. */}
        <Text className="shrink-0 text-[17px] font-semibold text-chalk">
          {income ? "+" : "−"}
          {money.format(t.amount)}
        </Text>
      </View>
    </Pressable>
  );
}
