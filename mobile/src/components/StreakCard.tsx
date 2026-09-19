/**
 * Streak card. Like the web version, the streak counts days the app was *used*,
 * not only days with an expense — `activeDaySet()` supplies the usage log and
 * the shared streak helpers fold it in with the transactions.
 */
import { Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useStore } from "@/data/store";
import { currentStreak, last7Days } from "@/lib/streak";
import { activeDaySet } from "~/lib/activity";
import { Eyebrow } from "./ui";
import { CheckIcon } from "./icons";

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** Static flame — warm orange/red, no flicker (the animation was distracting). */
function Flame({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="flameOuter" x1="12" y1="2" x2="12" y2="22" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFB020" />
          <Stop offset="0.55" stopColor="#FF6A00" />
          <Stop offset="1" stopColor="#E4320B" />
        </LinearGradient>
        <LinearGradient id="flameInner" x1="12" y1="9" x2="12" y2="20" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFE35A" />
          <Stop offset="1" stopColor="#FF8A00" />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 2c2.2 3.1 1.2 4.9.3 6.2-.8 1.2-1.6 2.2-1.6 3.6a2.4 2.4 0 0 0 4.8.2c0-.6-.1-1.1-.3-1.6 2 1.4 3.3 3.6 3.3 6.1A6.5 6.5 0 0 1 12 23a6.5 6.5 0 0 1-6.5-6.5c0-3.3 1.9-5.2 3.6-7.1C10.6 7.7 12.2 5.6 12 2z"
        fill="url(#flameOuter)"
      />
      <Path
        d="M12 12.5c1.3 1 2.1 2.3 2.1 3.8A2.6 2.6 0 0 1 12 19a2.6 2.6 0 0 1-2.1-2.7c0-1.5.8-2.8 2.1-3.8z"
        fill="url(#flameInner)"
      />
    </Svg>
  );
}

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
          <View className="mt-1 flex-row items-center gap-2">
            <Flame />
            <Text className="text-[26px] font-bold tracking-tight text-chalk">
              {streak} {streak === 1 ? "day" : "days"}
            </Text>
          </View>
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
