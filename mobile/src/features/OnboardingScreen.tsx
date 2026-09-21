/**
 * The screens between signing in and the paywall: two showing what the app is
 * for, then a budget to start from.
 *
 * The budget step earns its place — Home leads with "budget remaining", which
 * has nothing to say until a budget exists, so asking once here is better than
 * an empty hero and a pointer to Settings. It can still be skipped.
 */
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { currencyByCode } from "@/data/currencies";
import { amountTextToCents, sanitizeAmountText } from "~/lib/amount";
import { Button, FadeIn, Input } from "~/components/ui";
import { BarChartIcon, WalletIcon } from "~/components/icons";

type Step = "what" | "why" | "budget";
const STEPS: Step[] = ["what", "why", "budget"];

const PRESETS = [500, 1000, 2000, 5000];

export function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const { data, setMonthlyBudget } = useStore();
  const money = useMoney();
  const [i, setI] = useState(0);
  const [amountText, setAmountText] = useState("");

  const step = STEPS[i];
  const cents = amountTextToCents(amountText);
  const symbol = currencyByCode(data.preferences.currency).symbol;

  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : onDone());

  const saveBudget = () => {
    if (cents > 0) setMonthlyBudget(cents);
    onDone();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-ink-950">
      <View className="flex-row items-center gap-3 px-6" style={{ paddingTop: insets.top + 12 }}>
        <Pressable
          onPress={() => (i > 0 ? setI(i - 1) : undefined)}
          disabled={i === 0}
          className={`py-2 pr-2 active:opacity-60 ${i === 0 ? "opacity-0" : ""}`}
        >
          <Text className="text-[15px] font-medium text-chalk-mute">Back</Text>
        </Pressable>
        <View className="flex-1 flex-row items-center gap-1.5">
          {STEPS.map((s, idx) => (
            <View key={s} className={`h-1 flex-1 rounded-pill ${idx <= i ? "bg-chalk" : "bg-ink-700"}`} />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {step === "what" ? (
          <FadeIn key="what" className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-[22px] border border-line bg-ink-800">
              <WalletIcon size={30} />
            </View>
            <Text className="mt-6 text-center text-[28px] font-bold leading-tight tracking-tight text-chalk">
              Log spending in seconds
            </Text>
            <Text className="mt-3 max-w-[20rem] text-center text-[15px] leading-relaxed text-chalk-mute">
              An amount and a tap. No clutter, no friction, nothing to set up first.
            </Text>
          </FadeIn>
        ) : null}

        {step === "why" ? (
          <FadeIn key="why" className="items-center">
            <View className="h-16 w-16 items-center justify-center rounded-[22px] border border-line bg-ink-800">
              <BarChartIcon size={30} />
            </View>
            <Text className="mt-6 text-center text-[28px] font-bold leading-tight tracking-tight text-chalk">
              See where your money goes
            </Text>
            <Text className="mt-3 max-w-[20rem] text-center text-[15px] leading-relaxed text-chalk-mute">
              A clear monthly picture, a category breakdown, and every subscription in one place.
            </Text>
          </FadeIn>
        ) : null}

        {step === "budget" ? (
          <FadeIn key="budget">
            <Text className="text-center text-[28px] font-bold leading-tight tracking-tight text-chalk">
              What&apos;s your monthly budget?
            </Text>
            <Text className="mx-auto mt-3 max-w-[20rem] text-center text-[15px] leading-relaxed text-chalk-mute">
              Home shows what&apos;s left of it. You can change or remove it later in Settings.
            </Text>

            <View className="mt-8 items-center">
              <Text className="text-[44px] font-bold leading-none tracking-tight text-chalk">
                {money.format(cents)}
              </Text>
            </View>

            <Input
              value={amountText}
              onChangeText={(t) => setAmountText(sanitizeAmountText(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
              className="mt-6"
              leading={<Text className="text-[16px] text-chalk-mute">{symbol}</Text>}
            />

            <View className="mt-4 flex-row flex-wrap justify-center gap-2">
              {PRESETS.map((v) => (
                <Pressable
                  key={v}
                  onPress={() => setAmountText(String(v))}
                  className="rounded-pill border border-line-strong bg-ink-850 px-4 py-2 active:opacity-80"
                >
                  <Text className="text-[13px] font-medium text-chalk">
                    {symbol}
                    {v.toLocaleString(money.locale)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </FadeIn>
        ) : null}
      </ScrollView>

      <View className="gap-3 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button variant="primary" size="lg" fullWidth onPress={step === "budget" ? saveBudget : next}>
          {step === "budget" ? (cents > 0 ? "Set budget" : "Continue") : "Continue"}
        </Button>
        <Pressable onPress={onDone} className="items-center py-1 active:opacity-60">
          <Text className="text-[13px] font-medium text-chalk-mute">
            {step === "budget" ? "Decide later" : "Skip"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
