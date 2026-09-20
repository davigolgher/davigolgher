/**
 * Streak card. Like the web version, the streak counts days the app was *used*,
 * not only days with an expense — `activeDaySet()` supplies the usage log and
 * the shared streak helpers fold it in with the transactions.
 */
import { Text, View } from "react-native";
import { useStore } from "@/data/store";
import { currentStreak, last7Days } from "@/lib/streak";
import { activeDaySet } from "~/lib/activity";
import { Eyebrow } from "./ui";
import { CheckIcon } from "./icons";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

export function StreakCard() {
  const { data, now } = useStore();
  const usage = activeDaySet(now);
  const streak = currentStreak(data.transactions, now, usage);
  const week = last7Days(data.transactions, now, usage);
  const todayIndex = week.length - 1;

  return (
    <View className="rounded-card border border-line bg-ink-850 p-5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Eyebrow>Streak</Eyebrow>
          <Text className="mt-1 text-[26px] font-bold tracking-tight text-chalk">
            {streak} {streak === 1 ? "day" : "days"}
          </Text>
          <Text className="mt-1 text-[13px] text-chalk-mute">
            {streak === 0 ? "Open the app tomorrow to start a streak" : "Keep it going — open Flow every day"}
          </Text>
        </View>
      </View>

      {/* Last 7 days. Extra right padding so today's dot never crowds the edge. */}
      <View className="mt-4 flex-row justify-between pr-1">
        {week.map((active, i) => {
          const isToday = i === todayIndex;
          return (
            <View key={i} className="items-center gap-1.5">
              <View
                className={[
                  "h-8 w-8 items-center justify-center rounded-full border",
                  active ? "border-chalk bg-chalk" : "border-line-strong bg-ink-800",
                  isToday && !active ? "border-chalk" : "",
                ].join(" ")}
              >
                {active ? <CheckIcon size={15} color="#FFFFFF" strokeWidth={2.2} /> : null}
              </View>
              <Text className={`text-[11px] ${isToday ? "font-semibold text-chalk" : "text-chalk-faint"}`}>
                {DAY_INITIALS[new Date(now.getTime() - (todayIndex - i) * 86400000).getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
