/**
 * Add a recurring subscription. Presented as a modal from the Subs tab.
 *
 * Amount is collected as digits and converted with the shared `digitsToCents`,
 * so money never passes through a float. Saving goes through the shared store,
 * which writes to Supabase in the background under the user's RLS policies.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { digitsToCents } from "@/lib/money";
import { FREQUENCY_LABEL, type Frequency } from "@/lib/recurrence";
import { Button, Eyebrow, FitNumber, Input } from "~/components/ui";

const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];

/** Days until the first charge, offered as presets so there's no date picker to fight. */
const WHEN = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In a week", days: 7 },
  { label: "In a month", days: 30 },
];

export default function AddSubscription() {
  const insets = useSafeAreaInsets();
  const { data, addSubscription } = useStore();
  const money = useMoney();

  const [name, setName] = useState("");
  const [digits, setDigits] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [inDays, setInDays] = useState(30);
  const [categoryId, setCategoryId] = useState(data.categories[0]?.label ?? "Subscriptions");

  const cents = digitsToCents(digits);
  const canSave = cents > 0 && name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    const next = new Date();
    next.setDate(next.getDate() + inDays);
    addSubscription({
      name: name.trim(),
      amount: cents,
      currency: data.preferences.currency,
      frequency,
      nextChargeAt: next.toISOString(),
      status: "active",
      categoryId,
      reminders: true,
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
          <Text className="text-[17px] font-semibold tracking-tight text-chalk">New subscription</Text>
          <View className="w-14" />
        </View>

        <View className="mt-8 items-center">
          <Eyebrow>Amount</Eyebrow>
          <FitNumber className="mt-2 text-center text-[52px] font-bold leading-none tracking-tight text-chalk">
            {money.format(cents)}
          </FitNumber>
        </View>

        <View className="mt-6 gap-3">
          <Input
            value={digits}
            onChangeText={(t) => setDigits(t.replace(/\D/g, "").slice(0, 12))}
            keyboardType="number-pad"
            placeholder="Amount in digits"
            autoFocus
          />
          <Input value={name} onChangeText={setName} placeholder="Name (Netflix, Spotify…)" />
        </View>

        <View className="mt-8">
          <Eyebrow>Billing period</Eyebrow>
          <View className="mt-2 flex-row gap-2">
            {FREQUENCIES.map((f) => {
              const on = f === frequency;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFrequency(f)}
                  className={`flex-1 items-center rounded-pill border py-2.5 active:opacity-80 ${
                    on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"
                  }`}
                >
                  <Text className={`text-[14px] font-semibold ${on ? "text-ink-950" : "text-chalk"}`}>
                    {FREQUENCY_LABEL[f]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-8">
          <Eyebrow>First charge</Eyebrow>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {WHEN.map((w) => {
              const on = w.days === inDays;
              return (
                <Pressable
                  key={w.label}
                  onPress={() => setInDays(w.days)}
                  className={`rounded-pill border px-3.5 py-2 active:opacity-80 ${
                    on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"
                  }`}
                >
                  <Text className={`text-[13px] font-medium ${on ? "text-ink-950" : "text-chalk"}`}>{w.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
                    on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"
                  }`}
                >
                  <Text className={`text-[13px] font-medium ${on ? "text-ink-950" : "text-chalk"}`}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-10">
          <Button variant="primary" fullWidth size="lg" disabled={!canSave} onPress={save}>
            Add subscription
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
