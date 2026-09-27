/**
 * The streak on Home — compact on purpose.
 *
 * Four answers at a glance: how many days (the number), whether today is done
 * (the ring and today's dot), what keeps it going (the review button, only
 * while today is open) and what's next (the milestone line, once it's done).
 * Everything else — record, history, the milestone ladder — lives one tap away
 * in the detail view, so Home stays about money.
 *
 * A day counts when it's reviewed; see lib/streak for the rule.
 */
import { useMemo } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useStore } from "@/data/store";
import { fromDayKey, streakSummary, weekCells, type StreakSummary } from "@/lib/streak";
import { Button } from "./ui";
import { CheckIcon, ChevronRightIcon } from "./icons";
import { streakCopy, type StreakCopy } from "~/features/streak/copy";
import { useTodayKey } from "~/features/streak/useTodayKey";
import { useStreakCelebration } from "~/features/streak/celebration";
import { StreakMark, type MarkState } from "~/features/streak/StreakMark";
import { RollingCount } from "~/features/streak/RollingCount";
import { DayDot } from "~/features/streak/DayDot";

const INK = "#0A0A0A";
/** chalk-faint: the zero count is large text, where 3:1 is the bar. */
const FAINT = "#8A8A8F";

export function markStateFor(s: StreakSummary): MarkState {
  return s.doneToday ? "closed" : s.current > 0 ? "open" : "empty";
}

/**
 * The line that says where today stands. Shared with the detail view, which
 * centres it under the hero and leaves the milestone line to its own card.
 */
export function StreakStatus({
  s,
  t,
  onReview,
  centered = false,
  showNext = true,
}: {
  s: StreakSummary;
  t: StreakCopy;
  onReview?: () => void;
  centered?: boolean;
  showNext?: boolean;
}) {
  const align = centered ? "text-center" : "";
  if (s.doneToday) {
    const headline = s.milestoneToday
      ? t.reached(s.milestoneToday, s.milestoneFirstTime)
      : s.current === 1 && s.best > 1
        ? t.restarted
        : t.statusDone;
    return (
      <View>
        <View className={`flex-row items-center gap-2 ${centered ? "justify-center" : ""}`}>
          <CheckIcon size={15} strokeWidth={2.4} />
          <Text className={`${centered ? "" : "min-w-0 flex-1"} text-[14px] font-semibold text-chalk`}>{headline}</Text>
        </View>
        {showNext ? (
          <Text className={`mt-1 text-[13px] leading-relaxed text-chalk-mute ${align}`}>
            {t.remaining(s.next.remaining, t.goal(s.next.target, s.next.firstTime))}
          </Text>
        ) : null}
      </View>
    );
  }

  const [headline, body] =
    s.state === "first"
      ? [t.firstTitle, t.firstBody]
      : s.state === "resume"
        ? [t.resumeTitle, t.resumeBody(s.best)]
        : [t.statusPending, null];

  return (
    <View>
      <Text className={`text-[14px] font-semibold text-chalk ${align}`}>{headline}</Text>
      {body ? <Text className={`mt-1 text-[13px] leading-relaxed text-chalk-mute ${align}`}>{body}</Text> : null}
      {onReview ? (
        <View className="mt-3">
          <Button variant="primary" size="sm" pill onPress={onReview}>
            {t.cta}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

export function StreakCard() {
  const { data } = useStore();
  const t = useMemo(() => streakCopy(), []);
  const todayKey = useTodayKey();
  const now = useMemo(() => fromDayKey(todayKey), [todayKey]);
  const s = useMemo(() => streakSummary(data.activeDays, now), [data.activeDays, now]);
  const week = useMemo(() => weekCells(data.activeDays, now), [data.activeDays, now]);

  // Home's cards fade in on focus; wait for that before the beat starts.
  const c = useStreakCelebration(todayKey, s.doneToday, s.current, s.milestoneToday, 520);
  const moving = c.run !== null && !c.reduced;

  return (
    <Pressable
      onPress={() => router.push("/streak")}
      accessibilityRole="button"
      accessibilityLabel={t.a11yCard(s.current, s.doneToday)}
      className="rounded-card border border-line bg-ink-850 p-5 active:opacity-90"
    >
      <View className="flex-row items-center gap-4">
        <StreakMark size={48} state={markStateFor(s)} milestone={s.milestoneToday !== null} anim={moving ? c : null} />
        <View className="min-w-0 flex-1">
          <RollingCount
            value={s.current}
            from={moving ? (c.run?.from ?? null) : null}
            roll={c.roll}
            size={34}
            color={s.current === 0 ? FAINT : INK}
          />
          <Text className="text-[13px] text-chalk-mute" maxFontSizeMultiplier={1.4}>
            {t.unit(s.current)}
          </Text>
        </View>
        <ChevronRightIcon size={18} color={FAINT} />
      </View>

      <View className="mt-5 flex-row justify-between">
        {week.map((cell, i) => (
          <View key={cell.key} className="items-center gap-1.5">
            <DayDot mark={cell.mark} size={30} fill={moving && cell.isToday ? c.fill : null} />
            <Text
              maxFontSizeMultiplier={1.3}
              style={{
                fontSize: 11,
                fontWeight: cell.isToday ? "700" : "500",
                color: cell.isToday ? INK : cell.mark === "future" || cell.mark === "idle" ? "#6E6E73" : "#3F3F46",
              }}
            >
              {t.weekInitials[i]}
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-5 border-t border-line-soft pt-4">
        <Animated.View
          style={
            c.run
              ? {
                  opacity: c.message,
                  transform: c.reduced
                    ? []
                    : [{ translateY: c.message.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
                }
              : undefined
          }
        >
          <StreakStatus s={s} t={t} onReview={() => router.push("/review")} />
        </Animated.View>
      </View>
    </Pressable>
  );
}
