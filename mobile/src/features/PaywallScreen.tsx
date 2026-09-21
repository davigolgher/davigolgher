/**
 * Paywall.
 *
 * App Review reads this screen closely (Guideline 3.1.2), so at the point of
 * purchase it has to state the subscription's length, its price and period,
 * that it renews by itself, and how to cancel — plus working links to the Terms
 * and the Privacy Policy, and a way to restore an existing purchase.
 *
 * Every price shown comes from StoreKit via `purchases`. Nothing here falls back
 * to a number typed into the repo: a storefront in another country would be told
 * the wrong price, and being wrong about a price is worse than saying nothing.
 */
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP } from "@/config/app";
import type { LegalDocId } from "@/features/legal/content";
import { signOut } from "@/lib/backend/auth";
import { purchases, type Plan, type PlanId } from "~/lib/purchases";
import { Button, Eyebrow, FadeIn } from "~/components/ui";
import { BarChartIcon, CheckIcon, RepeatIcon, WalletIcon } from "~/components/icons";
import { LogoMark } from "~/components/Logo";
import { LegalModal } from "./LegalDoc";

/**
 * Only things the app actually does. App Review checks that what a paywall
 * promises is there, and a feature listed here but missing is a rejection.
 */
const VALUE = [
  { icon: <WalletIcon size={18} />, text: "Unlimited expenses and income" },
  { icon: <BarChartIcon size={18} />, text: "Category and monthly reports" },
  { icon: <RepeatIcon size={18} />, text: "Every subscription in one place" },
  { icon: <CheckIcon size={18} />, text: "Synced to your account, private by design" },
];

export function PaywallScreen({ onUnlocked, canSkip }: { onUnlocked: () => void; canSkip: boolean }) {
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [selected, setSelected] = useState<PlanId>("yearly");
  const [busy, setBusy] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);

  useEffect(() => {
    let alive = true;
    purchases
      .getPlans()
      .then((p) => alive && setPlans(p))
      .catch(() => alive && setPlans([]));
    return () => {
      alive = false;
    };
  }, []);

  const plan = plans?.find((p) => p.id === selected) ?? null;

  const buy = async () => {
    setBusy(true);
    try {
      const { entitled } = await purchases.purchase(selected);
      if (entitled) onUnlocked();
    } catch (e) {
      Alert.alert("Couldn't complete the purchase", (e as Error)?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    try {
      const { entitled } = await purchases.restore();
      if (entitled) onUnlocked();
      else Alert.alert("Nothing to restore", "No previous subscription was found for this Apple ID.");
    } catch (e) {
      Alert.alert("Couldn't restore", (e as Error)?.message ?? "Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 28,
          paddingHorizontal: 24,
        }}
      >
        <FadeIn className="items-center">
          <LogoMark size={44} />
          <Text className="mt-5 text-center text-[30px] font-bold tracking-tight text-chalk">
            Everything in {APP.name}
          </Text>
          <Text className="mt-2 text-center text-[15px] text-chalk-mute">{APP.tagline}</Text>
        </FadeIn>

        <FadeIn className="mt-8 gap-4" delay={60}>
          {VALUE.map((row) => (
            <View key={row.text} className="flex-row items-center gap-3">
              <View className="h-9 w-9 items-center justify-center rounded-full border border-line bg-ink-800">
                {row.icon}
              </View>
              <Text className="flex-1 text-[15px] text-chalk">{row.text}</Text>
            </View>
          ))}
        </FadeIn>

        <FadeIn className="mt-8" delay={120}>
          {plans === null ? (
            <View className="items-center py-8">
              <ActivityIndicator color="#0A0A0A" />
            </View>
          ) : plans.length === 0 ? (
            <View className="rounded-card border border-dashed border-line-strong p-5">
              <Text className="text-center text-[14px] leading-relaxed text-chalk-mute">
                Subscriptions aren&apos;t available in this build. Prices come from the App Store, which needs a native
                build to reach.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {plans.map((p) => {
                const on = p.id === selected;
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => setSelected(p.id)}
                    className={`flex-row items-center justify-between gap-3 rounded-card border p-4 active:opacity-80 ${
                      on ? "border-chalk bg-ink-800" : "border-line-strong bg-ink-850"
                    }`}
                  >
                    <View className="min-w-0 flex-1">
                      <Text className="text-[15px] font-semibold text-chalk">
                        {p.id === "yearly" ? "Yearly" : "Monthly"}
                      </Text>
                      <Text className="mt-0.5 text-[13px] text-chalk-mute">
                        {p.trialDays > 0 ? `${p.trialDays}-day free trial, then ` : ""}
                        {p.price} / {p.period}
                      </Text>
                    </View>
                    <View
                      className={`h-5 w-5 items-center justify-center rounded-full border ${
                        on ? "border-chalk bg-chalk" : "border-line-strong"
                      }`}
                    >
                      {on ? <CheckIcon size={13} color="#FFFFFF" strokeWidth={2.4} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </FadeIn>

        <FadeIn className="mt-6 gap-3" delay={180}>
          <Button variant="primary" size="lg" fullWidth disabled={!plan || busy} onPress={buy}>
            {busy ? "Please wait…" : plan && plan.trialDays > 0 ? `Start ${plan.trialDays}-day free trial` : "Subscribe"}
          </Button>

          {/* Apple requires a restore path for a previously bought subscription. */}
          <Button variant="secondary" size="lg" fullWidth disabled={busy} onPress={restore}>
            Restore purchases
          </Button>
        </FadeIn>

        {/* Guideline 3.1.2 disclosure, built from the plan the store described. */}
        <FadeIn className="mt-6" delay={220}>
          <Text className="text-center text-[11px] leading-relaxed text-chalk-faint">
            {plan ? (
              <>
                {plan.trialDays > 0
                  ? `Your ${plan.trialDays}-day free trial is free; after it ends the subscription costs ${plan.price} per ${plan.period}. `
                  : `The subscription costs ${plan.price} per ${plan.period}. `}
                It renews automatically at {plan.price} per {plan.period} unless cancelled at least 24 hours before the
                current period ends. Payment is charged to your Apple ID at confirmation of purchase. Manage or cancel
                it any time in iOS Settings → your name → Subscriptions.
              </>
            ) : (
              <>
                Subscriptions renew automatically until cancelled. Payment is charged to your Apple ID at confirmation
                of purchase, and you can manage or cancel in iOS Settings → your name → Subscriptions.
              </>
            )}
          </Text>

          <View className="mt-3 flex-row items-center justify-center gap-2">
            <Text className="text-[11px] font-medium text-chalk-mute underline" onPress={() => setLegalDoc("terms")}>
              Terms of Use
            </Text>
            <Text className="text-[11px] text-chalk-faint">·</Text>
            <Text className="text-[11px] font-medium text-chalk-mute underline" onPress={() => setLegalDoc("privacy")}>
              Privacy Policy
            </Text>
          </View>
        </FadeIn>

        <FadeIn className="mt-8 items-center gap-4" delay={260}>
          {canSkip ? (
            <Pressable onPress={onUnlocked} className="items-center active:opacity-60">
              <Eyebrow>Development</Eyebrow>
              <Text className="mt-1 text-[14px] font-semibold text-chalk">Skip for now</Text>
              <Text className="mt-1 text-center text-[11px] text-chalk-faint">
                Only in Expo Go — a release build has no way past this screen.
              </Text>
            </Pressable>
          ) : null}

          <Pressable onPress={() => void signOut()} className="py-1 active:opacity-60">
            <Text className="text-[13px] text-chalk-mute">Sign out</Text>
          </Pressable>
        </FadeIn>
      </ScrollView>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </View>
  );
}
