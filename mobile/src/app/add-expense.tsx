/**
 * Add or edit a transaction. Presented as a modal; passing `?id=` switches it
 * into edit mode for that transaction.
 *
 * Money is parsed once here and held as integer cents everywhere after, the
 * same rule the rest of the app follows.
 */
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { currencyByCode } from "@/data/currencies";
import { amountTextToCents, centsToAmountText, sanitizeAmountText } from "~/lib/amount";
import { Button, Eyebrow, FitNumber, Input } from "~/components/ui";
import { CategoryPicker } from "~/components/CategoryPicker";

export default function AddExpense() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, addTransaction, updateTransaction } = useStore();
  const money = useMoney();

  const existing = useMemo(
    () => (id ? data.transactions.find((t) => t.id === id) : undefined),
    [id, data.transactions],
  );
  const editing = Boolean(existing);

  const [amountText, setAmountText] = useState(existing ? centsToAmountText(existing.amount) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [direction, setDirection] = useState<"expense" | "income">(existing?.direction ?? "expense");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? data.categories[0]?.label ?? "Uncategorized");

  const cents = amountTextToCents(amountText);
  const canSave = cents > 0;
  // One save per sheet. The button stays live while the sheet slides away, and
  // a quick double tap in that moment saved the entry twice.
  const saved = useRef(false);

  const save = () => {
    if (!canSave || saved.current) return;
    saved.current = true;
    const fallback = direction === "income" ? "Income" : "Expense";
    if (existing) {
      updateTransaction({
        ...existing,
        amount: cents,
        direction,
        description: description.trim() || fallback,
        categoryId,
      });
    } else {
      addTransaction({
        amount: cents,
        description: description.trim() || fallback,
        categoryId,
        date: new Date().toISOString(),
        direction,
      });
    }
    router.back();
  };

  const title = editing
    ? direction === "income"
      ? "Edit income"
      : "Edit expense"
    : direction === "income"
      ? "Add income"
      : "Add expense";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} className="py-2 active:opacity-60">
            <Text className="text-[15px] font-medium text-chalk-mute">Cancel</Text>
          </Pressable>
          <Text className="text-[17px] font-semibold tracking-tight text-chalk">{title}</Text>
          <View className="w-14" />
        </View>

        {/* expense / income */}
        <View className="mt-6 flex-row gap-2">
          {(["expense", "income"] as const).map((d) => {
            const on = direction === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDirection(d)}
                className={`flex-1 items-center rounded-pill border py-2.5 active:opacity-80 ${
                  on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"
                }`}
              >
                <Text className={`text-[14px] font-semibold ${on ? "text-ink-950" : "text-chalk"}`}>
                  {d === "expense" ? "Expense" : "Income"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* amount */}
        <View className="mt-10 items-center">
          <Eyebrow>Amount</Eyebrow>
          <FitNumber className="mt-2 text-center text-[52px] font-bold leading-none tracking-tight text-chalk">
            {money.format(cents)}
          </FitNumber>
          <Input
            value={amountText}
            onChangeText={(t) => setAmountText(sanitizeAmountText(t))}
            keyboardType="decimal-pad"
            autoFocus={!editing}
            className="mt-4 w-full"
            placeholder="0"
            leading={
              <Text className="text-[16px] text-chalk-mute">{currencyByCode(data.preferences.currency).symbol}</Text>
            }
          />
        </View>

        {/* description */}
        <View className="mt-8">
          <Eyebrow>Description</Eyebrow>
          <Input
            value={description}
            onChangeText={setDescription}
            placeholder={direction === "income" ? "Salary" : "Coffee"}
            className="mt-2"
          />
        </View>

        {/* category */}
        <View className="mt-8">
          <Eyebrow>Category</Eyebrow>
          <View className="mt-2">
            <CategoryPicker value={categoryId} onChange={setCategoryId} />
          </View>
        </View>

        <View className="mt-10">
          <Button variant="primary" fullWidth size="lg" disabled={!canSave} onPress={save}>
            {editing ? "Save changes" : direction === "income" ? "Add income" : "Add expense"}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
