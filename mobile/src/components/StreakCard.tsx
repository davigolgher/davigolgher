/**
 * Streak card. A day counts when the daily review is completed — see
 * lib/streak for the rule and why it changed.
 */
import { useMemo } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { fromDayKey, streakSummary, weekCells } from "@/lib/streak";
import { Button, Eyebrow } from "./ui";
import { CheckIcon } from "./icons";
import { streakCopy } from "~/features/streak/copy";
import { useTodayKey } from "~/features/streak/useTodayKey";

export function StreakCard() {
  const { data } = useStore();
  const t = useMemo(() => streakCopy(), []);
  const todayKey = useTodayKey();
  const now = useMemo(() => fromDayKey(todayKey), [todayKey]);
  const s = useMemo(() => streakSummary(data.activeDays, now), [data.activeDays, now]);
  const week = useMemo(() => weekCells(data.activeDays, now), [data.activeDays, now]);

  const title =
    s.state === "first" ? t.firstTitle : s.state === "resume" ? t.resumeTitle : `${s.current} ${t.unit(s.current)}.`;
  const status =
    s.state === "first"
      ? t.firstBody
      : s.state === "resume"
        ? t.resumeBody(s.best)
        : s.doneToday
          ? t.statusDone
          : t.statusPending;

  return (
    <View className="rounded-card border border-line bg-ink-850 p-5">
      <Eyebrow>Streak</Eyebrow>
      <Text className="mt-1 text-[22px] font-bold tracking-tight text-chalk">{title}</Text>
      <Text className="mt-1 text-[13px] text-chalk-mute">{status}</Text>

      <View className="mt-4 flex-row justify-between pr-1">
        {week.map((c, i) => (
          <View key={c.key} className="items-center gap-1.5">
            <View
              className={[
                "h-8 w-8 items-center justify-center rounded-full border",
                c.mark === "done" ? "border-chalk bg-chalk" : "border-line-strong bg-ink-800",
                c.mark === "today" ? "border-chalk" : "",
              ].join(" ")}
            >
              {c.mark === "done" ? <CheckIcon size={15} color="#FFFFFF" strokeWidth={2.2} /> : null}
            </View>
            <Text className={`text-[11px] ${c.isToday ? "font-semibold text-chalk" : "text-chalk-faint"}`}>
              {t.weekInitials[i]}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-4">
        {s.doneToday ? (
          <View className="flex-row items-center gap-2">
            <CheckIcon size={15} strokeWidth={2.4} />
            <Text className="text-[13px] font-semibold text-chalk">{t.ctaDone}</Text>
          </View>
        ) : (
          <Button variant="primary" size="sm" pill onPress={() => router.push("/review")}>
            {t.cta}
          </Button>
        )}
      </View>
    </View>
  );
}
