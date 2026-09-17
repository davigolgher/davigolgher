/**
 * Add a transaction. Presented as a modal from the tabs.
 *
 * The amount is held as a raw digit string and converted with the shared
 * `digitsToCents`, so money never passes through a float — same rule as the web
 * app. Saving goes through the shared store, which writes to Supabase in the
 * background under the signed-in user's RLS policies.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { digitsToCents } from "@/lib/money";
import { Button, Eyebrow, FitNumber } from "~/components/ui";

export default function AddExpense() {
  const insets = useSafeAreaInsets();
  const { data, addTransaction } = useStore();
  const money = useMoney();

  const [digits, setDigits] = useState("");
  const [description, setDescription] = useState("");
  const [direction, setDirection] = useState<"expense" | "income">("expense");
  const [categoryId, setCategoryId] = useState(data.categories[0]?.label ?? "Uncategorized");

  const cents = digitsToCents(digits);
  const canSave = cents > 0;

  const save = () => {
    if (!canSave) return;
    addTransaction({
      amount: cents,
      description: description.trim() || (direction === "income" ? "Income" : "Expense"),
      categoryId,
      date: new Date().toISOString(),
      direction,
    });
    router.back();
  };

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
          <Text className="text-[17px] font-semibold tracking-tight text-chalk">
            {direction === "income" ? "Add income" : "Add expense"}
          </Text>
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
                  on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-800"
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
          {/* The visible number above is the formatted value; this input just
              collects digits, so it is kept off-screen-thin but focusable. */}
          <TextInput
            value={digits}
            onChangeText={(t) => setDigits(t.replace(/\D/g, "").slice(0, 12))}
            keyboardType="number-pad"
            autoFocus
            className="mt-4 w-full rounded-field border border-line-strong bg-ink-800 px-4 py-3 text-center text-[16px] text-chalk"
            placeholder="Type the amount"
            placeholderTextColor="#AEAEB4"
          />
          <Text className="mt-2 text-[12px] text-chalk-faint">Digits only — cents are added automatically</Text>
        </View>

        {/* description */}
        <View className="mt-8">
          <Eyebrow>Description</Eyebrow>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder={direction === "income" ? "Salary" : "Coffee"}
            placeholderTextColor="#AEAEB4"
            className="mt-2 rounded-field border border-line-strong bg-ink-800 px-4 py-3.5 text-[16px] text-chalk"
          />
        </View>

        {/* category */}
        <View className="mt-8">
          <Eyebrow>Category</Eyebrow>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {data.categories.map((c) => {
              const on = c.label === categoryId;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.label)}
                  className={`rounded-pill border px-3.5 py-2 active:opacity-80 ${
                    on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-800"
                  }`}
                >
                  <Text className={`text-[13px] font-medium ${on ? "text-ink-950" : "text-chalk"}`}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-10">
          <Button fullWidth size="lg" disabled={!canSave} onPress={save}>
            {direction === "income" ? "Add income" : "Add expense"}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
