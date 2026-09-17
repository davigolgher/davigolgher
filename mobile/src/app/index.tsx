/**
 * First native screen. Deliberately small: it exercises the whole chain end to
 * end — NativeWind styling, the ported design tokens, and the shared logic
 * imported from the web app's src/ via the "@/" alias — so a broken alias or
 * Metro config fails here rather than 40 screens from now.
 *
 * The real Home screen replaces this once the store layer is ported.
 */
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatCurrency, formatRelativeDay } from "@/lib/format";
import { Money, toCents } from "@/lib/money";
import { currentStreak } from "@/lib/streak";
import { activeDaySet } from "~/lib/activity";

// A few amounts run through the shared money helpers, in cents, as the app does.
const SPEND = [toCents(42.9), toCents(128), toCents(9.99), toCents(310.5)];

export default function Home() {
  const insets = useSafeAreaInsets();
  const total = Money.sum(SPEND);
  // No transactions yet on this screen, so the streak comes purely from app
  // usage — which is the behaviour the web app has too.
  const streak = currentStreak([], new Date(), activeDaySet());

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32, paddingHorizontal: 24 }}
    >
      <Text className="text-[17px] font-bold tracking-tight text-chalk">Flow</Text>

      <View className="mt-8">
        <Text className="text-eyebrow uppercase text-chalk-faint">Spent this month</Text>
        <Text className="mt-2 text-metric font-semibold text-chalk">{formatCurrency(total)}</Text>
        <Text className="mt-1 text-[13px] text-chalk-mute">{formatRelativeDay(new Date().toISOString())}</Text>
      </View>

      <View className="mt-8 flex-row gap-3">
        <View className="flex-1 rounded-card border border-line bg-ink-800 p-4">
          <Text className="text-eyebrow uppercase text-chalk-faint">Streak</Text>
          <Text className="mt-1.5 text-[22px] font-semibold text-chalk">
            {streak} {streak === 1 ? "day" : "days"}
          </Text>
        </View>
        <View className="flex-1 rounded-card border border-line bg-ink-800 p-4">
          <Text className="text-eyebrow uppercase text-chalk-faint">Expenses</Text>
          <Text className="mt-1.5 text-[22px] font-semibold text-chalk">{SPEND.length}</Text>
        </View>
      </View>

      <View className="mt-8 rounded-card border border-line bg-ink-800 p-4">
        <Text className="text-[15px] font-semibold text-chalk">Native shell is running</Text>
        <Text className="mt-2 text-[14px] leading-relaxed text-chalk-mute">
          Real native views, not a web page. The amounts and the streak above come from the same shared logic the web
          app uses, so there is one source of truth for the maths.
        </Text>
      </View>
    </ScrollView>
  );
}
