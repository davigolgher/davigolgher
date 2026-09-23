/** Subscriptions — what recurs, what it costs, and what's charged next. */
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { subscriptionsAnnualTotal, subscriptionsMonthlyTotal, upcomingCharges } from "@/lib/calc";
import { daysUntilCharge, FREQUENCY_LABEL } from "@/lib/recurrence";
import { formatDaysUntil } from "@/lib/format";
import { Button, Eyebrow, FadeIn, ScreenHeader, StatCard } from "~/components/ui";
import { PlusIcon } from "~/components/icons";
import { useFocusTick } from "~/lib/useFocusTick";

export default function Subs() {
  const insets = useSafeAreaInsets();
  const tick = useFocusTick();
  const { data, now, deleteSubscription } = useStore();
  const money = useMoney();

  const active = data.subscriptions.filter((s) => s.status === "active" || s.status === "trial");
  // Each total is derived from the real amounts. Annualising the *rounded*
  // monthly figure instead would multiply its rounding error by twelve — a
  // $50/year plan came back as $50.04 that way.
  const monthly = subscriptionsMonthlyTotal(data.subscriptions);
  const yearly = subscriptionsAnnualTotal(data.subscriptions);
  const upcoming = upcomingCharges(active, now);

  const confirmCancel = (id: string, name: string) => {
    Alert.alert(`Cancel ${name}?`, "It stops counting towards your recurring costs. This doesn't cancel it with the provider.", [
      { text: "Keep", style: "cancel" },
      { text: "Cancel it", style: "destructive", onPress: () => deleteSubscription(id) },
    ]);
  };

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
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

      <FadeIn className="mt-6 flex-row gap-4" delay={60} trigger={tick}>
        <StatCard label="Per month" value={money.format(monthly)} sub={`${active.length} active`} />
        <StatCard label="Per year" value={money.format(yearly)} sub="Annualised" />
      </FadeIn>

      <FadeIn className="mt-6" delay={120} trigger={tick}>
        <Eyebrow>Upcoming</Eyebrow>
        {upcoming.length > 0 ? (
          <View className="mt-1">
            {upcoming.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => router.push(`/add-subscription?id=${s.id}`)}
                onLongPress={() => confirmCancel(s.id, s.name)}
                className="flex-row items-center gap-3 border-b border-line-soft py-3.5 active:opacity-60"
              >
                <View className="min-w-0 flex-1">
                  <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
                    {s.name}
                  </Text>
                  <Text className="mt-0.5 text-[13px] text-chalk-mute">
                    {FREQUENCY_LABEL[s.frequency]} · {formatDaysUntil(daysUntilCharge(s, now))}
                  </Text>
                </View>
                <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(s.amount)}</Text>
              </Pressable>
            ))}
            <Text className="mt-3 text-[12px] text-chalk-faint">Tap to edit · press and hold to cancel.</Text>
          </View>
        ) : (
          <View className="mt-3 rounded-card border border-dashed border-line-strong p-6">
            <Text className="text-center text-[15px] leading-relaxed text-chalk-mute">
              Nothing recurring yet. Tap Add to track your first subscription.
            </Text>
          </View>
        )}
      </FadeIn>
    </ScrollView>
  );
}
