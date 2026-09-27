/**
 * Add or edit a recurring subscription. Presented as a modal; passing `?id=`
 * switches it into edit mode.
 */
import { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { currencyByCode } from "@/data/currencies";
import { FREQUENCY_LABEL, type Frequency } from "@/lib/recurrence";
import { amountTextToCents, centsToAmountText, sanitizeAmountText } from "~/lib/amount";
import { Button, Eyebrow, FitNumber, Input } from "~/components/ui";
import { CategoryPicker } from "~/components/CategoryPicker";

const FREQUENCIES: Frequency[] = ["weekly", "monthly", "yearly"];

/** Days until the first charge, as presets so there's no date picker to fight. */
const WHEN = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "In a week", days: 7 },
  { label: "In a month", days: 30 },
];

export default function AddSubscription() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, addSubscription, updateSubscription } = useStore();
  const money = useMoney();

  const existing = useMemo(
    () => (id ? data.subscriptions.find((s) => s.id === id) : undefined),
    [id, data.subscriptions],
  );
  const editing = Boolean(existing);

  const [name, setName] = useState(existing?.name ?? "");
  const [amountText, setAmountText] = useState(existing ? centsToAmountText(existing.amount) : "");
  const [frequency, setFrequency] = useState<Frequency>(existing?.frequency ?? "monthly");
  const [inDays, setInDays] = useState(30);
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? data.categories[0]?.label ?? "Subscriptions");
  const [remind, setRemind] = useState(existing?.reminders ?? true);

  const cents = amountTextToCents(amountText);
  const canSave = cents > 0 && name.trim().length > 0;
  // One save per sheet. The button stays live while the sheet slides away, and
  // a quick double tap in that moment saved the entry twice.
  const saved = useRef(false);

  const save = () => {
    if (!canSave || saved.current) return;
    saved.current = true;
    if (existing) {
      // Editing leaves the next charge date alone — it's the schedule already in
      // flight, not something the amount or name should reset.
      updateSubscription({ ...existing, name: name.trim(), amount: cents, frequency, categoryId, reminders: remind });
    } else {
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
        reminders: remind,
      });
    }
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
            {editing ? "Edit subscription" : "New subscription"}
          </Text>
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
            value={amountText}
            onChangeText={(t) => setAmountText(sanitizeAmountText(t))}
            keyboardType="decimal-pad"
            placeholder="0"
            autoFocus={!editing}
            leading={
              <Text className="text-[16px] text-chalk-mute">{currencyByCode(data.preferences.currency).symbol}</Text>
            }
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

        {!editing ? (
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
        ) : null}

        <View className="mt-8">
          <Eyebrow>Category</Eyebrow>
          <View className="mt-2">
            <CategoryPicker value={categoryId} onChange={setCategoryId} />
          </View>
        </View>

        <View className="mt-8 flex-row items-center gap-3 border-t border-line-soft pt-4">
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] text-chalk">Remind me before it charges</Text>
            <Text className="mt-0.5 text-[13px] text-chalk-mute">Switch reminders on in Settings to receive it.</Text>
          </View>
          <Switch
            value={remind}
            onValueChange={setRemind}
            trackColor={{ false: "#E5E5E7", true: "#0A0A0A" }}
            thumbColor="#FFFFFF"
            ios_backgroundColor="#E5E5E7"
          />
        </View>

        <View className="mt-8">
          <Button variant="primary" fullWidth size="lg" disabled={!canSave} onPress={save}>
            {editing ? "Save changes" : "Add subscription"}
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
