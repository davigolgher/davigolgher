/**
 * After signing up, before the paywall: one question, and a second only for
 * those it concerns.
 *
 *   1. What do you want from Flow? (any of: see where money goes, keep track
 *      of subscriptions, stay within a budget, follow a family member). The
 *      answer orders Home's suggestions and decides whether step 2 is asked.
 *   2. A monthly budget — only for someone who chose "budget". Home leads
 *      with "left to spend", which says nothing until a budget exists.
 *
 * It used to be two screens of explanation and the budget for everyone. The
 * welcome screen and the sample month now do the explaining, before any form
 * (docs/produto/estrategia.md). Everything can be skipped.
 *
 * Starter categories are added on the way out for an account that has none,
 * so the first expense takes two taps, not a detour to create a category.
 */
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { SAMPLE_CATEGORIES } from "@/data/sample";
import { useMoney } from "@/lib/useMoney";
import { CURRENCIES, currencyByCode } from "@/data/currencies";
import * as Localization from "expo-localization";
import { amountTextToCents, sanitizeAmountText } from "~/lib/amount";
import { Button, FadeIn, FitNumber, Input, PressableScale } from "~/components/ui";
import { hapticSelection } from "~/lib/haptics";
import { CheckIcon } from "~/components/icons";
import { FAMILY_ENABLED } from "~/features/family/flag";
import { track } from "~/lib/analytics";
import { colors, iconSize } from "~/theme/tokens";

type Step = "goals" | "budget";

export const GOALS = [
  { id: "spending", label: "See where my money goes" },
  { id: "subscriptions", label: "Keep track of subscriptions" },
  { id: "budget", label: "Stay within a monthly budget" },
  ...(FAMILY_ENABLED ? [{ id: "family", label: "Follow a family member's spending" }] : []),
] as const;

const PRESETS = [500, 1000, 2000, 5000];

/** The phone's currency, when Flow supports it. */
export function phoneCurrency(): string | null {
  try {
    const code = Localization.getLocales()[0]?.currencyCode ?? null;
    return code && CURRENCIES.some((c) => c.code === code) ? code : null;
  } catch {
    return null;
  }
}

export function OnboardingScreen({ onDone }: { onDone: (goals: string[]) => void }) {
  const insets = useSafeAreaInsets();
  const { data, setMonthlyBudget, addCategory, setCurrency } = useStore();
  const money = useMoney();
  const [step, setStep] = useState<Step>("goals");
  const [goals, setGoals] = useState<string[]>([]);
  const [amountText, setAmountText] = useState("");

  const cents = amountTextToCents(amountText);
  const symbol = currencyByCode(data.preferences.currency).symbol;
  const steps: Step[] = goals.includes("budget") ? ["goals", "budget"] : ["goals"];
  const i = steps.indexOf(step);

  useEffect(() => track("onboarding_started"), []);
  useEffect(() => track("onboarding_step_viewed", { step }), [step]);

  const finish = (how: "completed" | "skipped") => {
    if (data.categories.length === 0) for (const label of SAMPLE_CATEGORIES) addCategory(label);
    // A new account starts in the phone's own currency, not in dollars for
    // everyone: a Brazilian's first bank would otherwise import nothing (Flow
    // imports the accounts in its currency) and every total would read "$".
    if (data.transactions.length === 0) {
      const local = phoneCurrency();
      if (local && local !== data.preferences.currency) setCurrency(local);
    }
    track(how === "completed" ? "onboarding_completed" : "onboarding_skipped", { step, goals: goals.join(",") });
    onDone(goals);
  };

  const next = () => {
    track("onboarding_step_completed", { step, goals: goals.join(",") });
    if (step === "goals" && goals.includes("budget")) setStep("budget");
    else finish("completed");
  };

  const saveBudget = () => {
    if (cents > 0) {
      setMonthlyBudget(cents);
      track("budget_set", { source: "onboarding" });
    }
    next();
  };

  const toggle = (id: string) => {
    hapticSelection();
    setGoals((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-ink-950">
      <View className="flex-row items-center gap-3 px-6" style={{ paddingTop: insets.top + 12 }}>
        <Pressable
          onPress={() => (i > 0 ? setStep(steps[i - 1]) : undefined)}
          disabled={i === 0}
          accessibilityRole="button"
          className={`py-2 pr-2 active:opacity-60 ${i === 0 ? "opacity-0" : ""}`}
        >
          <Text className="text-[15px] font-medium text-chalk-mute">Back</Text>
        </Pressable>
        <View className="flex-1 flex-row items-center gap-1.5">
          {steps.map((s, idx) => (
            <View key={s} className={`h-1 flex-1 rounded-pill ${idx <= i ? "bg-chalk" : "bg-ink-700"}`} />
          ))}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {step === "goals" ? (
          <FadeIn key="goals">
            <Text className="text-[28px] font-bold leading-tight tracking-tight text-chalk" accessibilityRole="header">
              What do you want Flow to do for you?
            </Text>
            <Text className="mt-3 text-[15px] leading-relaxed text-chalk-mute">Pick any. Flow puts these first.</Text>
            <View className="mt-6 gap-2.5">
              {GOALS.map((g) => {
                const on = goals.includes(g.id);
                return (
                  <PressableScale
                    key={g.id}
                    onPress={() => toggle(g.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    className={`flex-row items-center justify-between rounded-card-sm border px-4 py-4 ${on ? "border-chalk bg-ink-800" : "border-line-strong bg-ink-850"}`}
                  >
                    <Text className="text-body font-medium text-chalk">{g.label}</Text>
                    <View className={`h-6 w-6 items-center justify-center rounded-pill border ${on ? "border-chalk bg-chalk" : "border-line-strong"}`}>
                      {on ? <CheckIcon size={iconSize.sm} color={colors.ink[950]} strokeWidth={2.4} /> : null}
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </FadeIn>
        ) : null}

        {step === "budget" ? (
          <View>
            <FadeIn key="budget">
              <Text className="text-center text-[28px] font-bold leading-tight tracking-tight text-chalk">
                What&apos;s your monthly budget?
              </Text>
              <Text className="mx-auto mt-3 max-w-[20rem] text-center text-[15px] leading-relaxed text-chalk-mute">
                Home shows what&apos;s left of it. You can change or remove it later in Settings.
              </Text>

              <View className="mt-8 items-center">
                <FitNumber className="text-center text-[44px] font-bold leading-none tracking-tight text-chalk">
                  {money.format(cents)}
                </FitNumber>
              </View>
            </FadeIn>

            {/* The field sits outside the FadeIn, and isn't auto-focused, on
                purpose: focusing it while its parent was still fading in made
                iOS draw it as a blank box until tapped again. */}
            <Input
              value={amountText}
              onChangeText={(t) => setAmountText(sanitizeAmountText(t))}
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
                    setAmountText(String(v));
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
          </View>
        ) : null}
      </ScrollView>

      <View className="gap-3 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button variant="primary" size="lg" fullWidth onPress={step === "budget" ? saveBudget : next}>
          {step === "budget" ? (cents > 0 ? "Set budget" : "Continue") : "Continue"}
        </Button>
        <Pressable onPress={() => finish("skipped")} accessibilityRole="button" className="items-center py-1 active:opacity-60">
          <Text className="text-[13px] font-medium text-chalk-mute">{step === "budget" ? "Decide later" : "Skip"}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
