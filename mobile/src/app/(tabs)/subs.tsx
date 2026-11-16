/**
 * Subscriptions — what recurs, what it costs, and what's charged next. On
 * top, the charges in the person's spending that look like subscriptions
 * they don't track yet: one tap to track, one to say it isn't.
 */
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { subscriptionsAnnualTotal, subscriptionsMonthlyTotal, upcomingCharges } from "@/lib/calc";
import { daysUntilCharge, FREQUENCY_LABEL } from "@/lib/recurrence";
import { formatDaysUntil } from "@/lib/format";
import { Button, Eyebrow, FadeIn, ScreenHeader, StatCard } from "~/components/ui";
import { PlusIcon } from "~/components/icons";
import { hapticHold, hapticSuccess } from "~/lib/haptics";
import { useTabScreenPadding } from "~/lib/screen";
import { useEffect } from "react";
import { SampleBanner } from "~/features/sample/SampleMode";
import { useFoundSubscriptions } from "~/features/subscriptions/useFoundSubscriptions";
import { BANKS_ENABLED } from "~/features/bank/flag";
import { track } from "~/lib/analytics";

export default function Subs() {
  const padding = useTabScreenPadding();
  const { data, now, deleteSubscription } = useStore();
  const money = useMoney();

  const active = data.subscriptions.filter((s) => s.status === "active" || s.status === "trial");
  // Each total is derived from the real amounts. Annualising the *rounded*
  // monthly figure instead would multiply its rounding error by twelve — a
  // $50/year plan came back as $50.04 that way.
  const monthly = subscriptionsMonthlyTotal(data.subscriptions);
  const yearly = subscriptionsAnnualTotal(data.subscriptions);
  const upcoming = upcomingCharges(active, now);
  const found = useFoundSubscriptions();
  useEffect(() => {
    if (found.candidates.length) track("subscription_suggestion_viewed", { count: found.candidates.length });
  }, [found.candidates.length]);

  const confirmCancel = (id: string, name: string) => {
    Alert.alert(`Cancel ${name}?`, "It stops counting towards your recurring costs. This doesn't cancel it with the provider.", [
      { text: "Keep", style: "cancel" },
      { text: "Cancel it", style: "destructive", onPress: () => deleteSubscription(id) },
    ]);
  };

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={padding}
    >
      <ScreenHeader
        eyebrow="Recurring"
        title="Subscriptions"
        action={
          <Button
            variant="primary"
            size="sm"
            pill
            leadingIcon={<PlusIcon size={16} color="#FFFFFF" strokeWidth={2.2} />}
            onPress={() => router.push("/add-subscription")}
          >
            Add
          </Button>
        }
      />

      <SampleBanner />

      {found.candidates.length > 0 ? (
        <FadeIn className="mt-6" delay={30}>
          <Eyebrow>Found in your spending</Eyebrow>
          <Text className="mt-1 text-[13px] text-chalk-mute">
            {`Charges that repeat every month — ${money.format(found.monthly)} a month together. Track the ones that are subscriptions.`}
          </Text>
          <View className="mt-2">
            {found.candidates.slice(0, 6).map((c) => (
              <View key={c.key} className="border-b border-line-soft py-3.5">
                <View className="flex-row items-center gap-3">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
                      {c.name}
                    </Text>
                    <Text className="mt-0.5 text-[13px] text-chalk-mute">
                      {`${FREQUENCY_LABEL[c.frequency]} · charged ${c.occurrences} times`}
                    </Text>
                  </View>
                  <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(c.amount)}</Text>
                </View>
                <View className="mt-2.5 flex-row gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => {
                      hapticSuccess();
                      found.accept(c);
                    }}
                  >
                    Track it
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => found.dismiss(c)}>
                    Not a subscription
                  </Button>
                </View>
              </View>
            ))}
          </View>
        </FadeIn>
      ) : null}

      <FadeIn className="mt-6 flex-row gap-4" delay={60}>
        <StatCard label="Per month" value={money.format(monthly)} sub={`${active.length} active`} />
        <StatCard label="Per year" value={money.format(yearly)} sub="Annualised" />
      </FadeIn>

      <FadeIn className="mt-6" delay={120}>
        <Eyebrow>Upcoming</Eyebrow>
        {upcoming.length > 0 ? (
          <View className="mt-1">
            {upcoming.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.push(`/add-subscription?id=${s.id}`)}
                onLongPress={() => {
                  hapticHold();
                  confirmCancel(s.id, s.name);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${s.name}, ${money.format(s.amount)}, ${FREQUENCY_LABEL[s.frequency]}, ${formatDaysUntil(daysUntilCharge(s, now))}`}
                accessibilityHint="Opens it to edit."
                // Press-and-hold can't be found with VoiceOver; offer it as an action.
                accessibilityActions={[{ name: "cancel", label: "Cancel subscription" }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === "cancel") confirmCancel(s.id, s.name);
                }}
                // The same cell as a transaction row, highlighted edge to edge.
                className="-mx-6 px-6 active:bg-ink-800"
              >
                <View className="flex-row items-center gap-3 border-b border-line-soft py-3.5">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
                      {s.name}
                    </Text>
                    <Text className="mt-0.5 text-[13px] text-chalk-mute">
                      {FREQUENCY_LABEL[s.frequency]} · {formatDaysUntil(daysUntilCharge(s, now))}
                    </Text>
                  </View>
                  <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(s.amount)}</Text>
                </View>
              </Pressable>
            ))}
            <Text className="mt-3 text-[12px] text-chalk-mute">Tap to edit · press and hold to cancel.</Text>
          </View>
        ) : (
          <View className="mt-3 rounded-card border border-dashed border-line-strong p-6">
            <Text className="text-center text-[15px] font-semibold text-chalk">Nothing recurring yet</Text>
            <Text className="mt-2 text-center text-[14px] leading-relaxed text-chalk-mute">
              Streaming, phone, gym, cloud storage: add them once and see the monthly and yearly total, with a heads-up before each charge.
            </Text>
            <View className="mt-4 items-center gap-2">
              <Button variant="primary" size="sm" onPress={() => router.push("/add-subscription")}>
                Add a subscription
              </Button>
              {BANKS_ENABLED && !data.isSimulated ? (
                <Button variant="ghost" size="sm" onPress={() => router.push("/banks")}>
                  Or connect your bank and Flow finds them
                </Button>
              ) : null}
            </View>
          </View>
        )}
      </FadeIn>
    </ScrollView>
  );
}
