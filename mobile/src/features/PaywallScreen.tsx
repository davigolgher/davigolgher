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
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP } from "@/config/app";
import type { LegalDocId } from "@/features/legal/content";
import { signOut } from "@/lib/backend/auth";
import { purchases, type Plan, type PlanId } from "~/lib/purchases";
import { Button, FadeIn } from "~/components/ui";
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

/**
 * The two plans are always drawn, whether or not the store answered.
 *
 * Their names are ours and are true either way; only the price belongs to the
 * storefront. Hiding the rows until StoreKit replies left a placeholder box
 * where the offer should be, which reads as a broken screen rather than a
 * paywall — and a skeleton that fills in beats a layout that jumps.
 */
const PLANS: { id: PlanId; label: string }[] = [
  { id: "yearly", label: "Yearly" },
  { id: "monthly", label: "Monthly" },
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
          <View className="gap-3">
            {PLANS.map(({ id, label }) => {
              const offer = plans?.find((p) => p.id === id);
              const on = id === selected;
              return (
                <Pressable
                  key={id}
                  onPress={() => setSelected(id)}
                  className={`flex-row items-center justify-between gap-3 rounded-card border p-4 active:opacity-80 ${
                    on ? "border-chalk bg-ink-800" : "border-line-strong bg-ink-850"
                  }`}
                >
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] font-semibold text-chalk">{label}</Text>
                    <Text className="mt-0.5 text-[13px] text-chalk-mute">
                      {offer
                        ? `${offer.trialDays > 0 ? `${offer.trialDays}-day free trial, then ` : ""}${offer.price} / ${offer.period}`
                        : "Price set by the App Store"}
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
        </FadeIn>

        <FadeIn className="mt-6 gap-3" delay={180}>
          <Button variant="primary" size="lg" fullWidth disabled={!plan || busy} onPress={buy}>
            {busy ? "Please wait…" : plan && plan.trialDays > 0 ? `Start ${plan.trialDays}-day free trial` : "Subscribe"}
          </Button>

          {/* Apple requires a restore path for a previously bought subscription. */}
          <Button variant="secondary" size="lg" fullWidth disabled={busy} onPress={restore}>
            Restore purchases
          </Button>

          {!purchases.available ? (
            <Text className="text-center text-[11px] leading-relaxed text-chalk-mute">
              Prices and purchasing come from the App Store, which this build can&apos;t reach.
            </Text>
          ) : null}
        </FadeIn>

        {/* Guideline 3.1.2 disclosure, built from the plan the store described. */}
        <FadeIn className="mt-6" delay={220}>
          <Text className="text-center text-[11px] leading-relaxed text-chalk-mute">
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

          {/* Real buttons with room around them: as bare 11 pt text they were
              about 14 pt tall, far under the 44 pt a finger needs. */}
          <View className="mt-2 flex-row items-center justify-center gap-1">
            <Pressable
              onPress={() => setLegalDoc("terms")}
              accessibilityRole="link"
              hitSlop={8}
              className="px-2 py-2.5 active:opacity-60"
            >
              <Text className="text-[12px] font-medium text-chalk-mute underline">Terms of Use</Text>
            </Pressable>
            <Text className="text-[12px] text-chalk-mute" importantForAccessibility="no" accessibilityElementsHidden>
              ·
            </Text>
            <Pressable
              onPress={() => setLegalDoc("privacy")}
              accessibilityRole="link"
              hitSlop={8}
              className="px-2 py-2.5 active:opacity-60"
            >
              <Text className="text-[12px] font-medium text-chalk-mute underline">Privacy Policy</Text>
            </Pressable>
          </View>
        </FadeIn>

        <FadeIn className="mt-8 items-center gap-3" delay={260}>
          {/* Development only — `canSkip` is false in any build that ships. */}
          {canSkip ? (
            <Pressable onPress={onUnlocked} className="py-1 active:opacity-60">
              <Text className="text-[13px] font-medium text-chalk-mute underline">Skip for now (development)</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={() => void signOut()} hitSlop={10} className="px-3 py-2.5 active:opacity-60">
            <Text className="text-[13px] text-chalk-mute">Sign out</Text>
          </Pressable>
        </FadeIn>
      </ScrollView>

      <LegalModal doc={legalDoc} onClose={() => setLegalDoc(null)} />
    </View>
  );
}
