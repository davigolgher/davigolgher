/** Transaction row, mirroring the web app's ExpenseRow. */
import { Pressable, Text, View } from "react-native";
import type { Transaction } from "@/data/types";
import { formatRelativeDay } from "@/lib/format";
import { useMoney } from "@/lib/useMoney";

export function ExpenseRow({ transaction: t, onPress }: { transaction: Transaction; onPress?: () => void }) {
  const money = useMoney();
  const income = t.direction === "income";

  return (
    <Pressable
      onPress={onPress}
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
