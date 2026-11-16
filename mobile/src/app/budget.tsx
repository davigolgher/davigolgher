/**
 * Set the monthly budget, from wherever it's missing (Home's "Set a budget").
 * Used to be a sentence pointing at Settings; now it's one screen away.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { currencyByCode } from "@/data/currencies";
import { useMoney } from "@/lib/useMoney";
import { amountTextToCents, sanitizeAmountText } from "~/lib/amount";
import { Button, FitNumber, Input, PressableScale } from "~/components/ui";
import { hapticSelection, hapticSuccess } from "~/lib/haptics";
import { track } from "~/lib/analytics";

const PRESETS = [500, 1000, 2000, 5000];

export default function BudgetSheet() {
  const insets = useSafeAreaInsets();
  const { data, setMonthlyBudget } = useStore();
  const money = useMoney();
  const current = data.budgets.find((b) => b.scope === "total")?.limit ?? 0;
  const [text, setText] = useState(current ? String(current / 100) : "");
  const cents = amountTextToCents(text);
  const symbol = currencyByCode(data.preferences.currency).symbol;

  const save = () => {
    if (cents <= 0) return;
    setMonthlyBudget(cents);
    hapticSuccess();
    track("budget_set", { source: "home" });
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-ink-950">
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <Text className="text-title font-bold text-chalk" accessibilityRole="header">
          Monthly budget
        </Text>
        <Text className="mt-2 text-body text-chalk-mute">Home shows what&apos;s left of it, and whether you&apos;re on track. Change it any time.</Text>
        <View className="mt-8 items-center">
          <FitNumber className="text-center text-[44px] font-bold leading-none tracking-tight text-chalk">{money.format(cents)}</FitNumber>
        </View>
        <Input
          value={text}
          onChangeText={(t) => setText(sanitizeAmountText(t))}
          keyboardType="decimal-pad"
          placeholder="0"
          className="mt-6"
          leading={<Text className="text-[16px] text-chalk-mute">{symbol}</Text>}
        />
        <View className="mt-4 flex-row flex-wrap justify-center gap-2">
          {PRESETS.map((v) => (
            <PressableScale
              key={v}
              onPress={() => {
                hapticSelection();
                setText(String(v));
              }}
              accessibilityRole="button"
              className="rounded-pill border border-line-strong bg-ink-850 px-4 py-2"
            >
              <Text className="text-[13px] font-medium text-chalk">
                {symbol}
                {v.toLocaleString(money.locale)}
              </Text>
            </PressableScale>
          ))}
        </View>
        <View className="mt-8 gap-3">
          <Button variant="primary" size="lg" fullWidth disabled={cents <= 0} onPress={save}>
            Set budget
          </Button>
          <Button variant="ghost" fullWidth onPress={() => router.back()}>
            Not now
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
