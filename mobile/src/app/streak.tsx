/**
 * The streak in full — opened from the card on Home as a sheet.
 *
 * Where Home answers "where am I today", this answers "how far have I come":
 * the record, how many days in total, the next milestone and how close it is,
 * the ladder of milestones, and a month-by-month history. A lapse never erases
 * any of it.
 */
import { useMemo, useState } from "react";
import { Animated, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { capitalizeFirst } from "@/lib/format";
import { MILESTONES, fromDayKey, monthCells, previousMilestone, streakSummary } from "@/lib/streak";
import { Button, Eyebrow, StatCard } from "~/components/ui";
import { ChevronRightIcon } from "~/components/icons";
import { StreakStatus, markStateFor } from "~/components/StreakCard";
import { streakCopy } from "~/features/streak/copy";
import { useTodayKey } from "~/features/streak/useTodayKey";
import { useStreakCelebration } from "~/features/streak/celebration";
import { StreakMark } from "~/features/streak/StreakMark";
import { RollingCount } from "~/features/streak/RollingCount";
import { DayDot } from "~/features/streak/DayDot";

const INK = "#0A0A0A";
const FAINT = "#AEAEB4";

export default function StreakDetail() {
  const insets = useSafeAreaInsets();
  const { data } = useStore();
  const t = useMemo(() => streakCopy(), []);
  const todayKey = useTodayKey();
  const now = useMemo(() => fromDayKey(todayKey), [todayKey]);
  const s = useMemo(() => streakSummary(data.activeDays, now), [data.activeDays, now]);

  // No entrance animation here to wait for — a sheet has its own.
  const c = useStreakCelebration(todayKey, s.doneToday, s.current, s.milestoneToday, 250);
  const moving = c.run !== null && !c.reduced;

  // History, a month at a time: back to the first reviewed month, forward to this one.
  const [cursor, setCursor] = useState(() => ({ y: now.getFullYear(), m: now.getMonth() }));
  const first = s.since ? fromDayKey(s.since) : now;
  const index = (y: number, m: number) => y * 12 + m;
  const canPrev = index(cursor.y, cursor.m) > index(first.getFullYear(), first.getMonth());
  const canNext = index(cursor.y, cursor.m) < index(now.getFullYear(), now.getMonth());
  const shift = (d: number) =>
    setCursor(({ y, m }) => {
      const n = index(y, m) + d;
      return { y: Math.floor(n / 12), m: n % 12 };
    });
  const rows = useMemo(
    () => monthCells(data.activeDays, cursor.y, cursor.m, now),
    [data.activeDays, cursor.y, cursor.m, now],
  );
  const monthLabel = capitalizeFirst(
    new Intl.DateTimeFormat(t.locale, { month: "long", year: "numeric" }).format(new Date(cursor.y, cursor.m, 1)),
  );
  const dayLabel = (d: Date) => new Intl.DateTimeFormat(t.locale, { day: "numeric", month: "long" }).format(d);

  const from = previousMilestone(s.current);
  const progress = Math.min(1, Math.max(0, (s.current - from) / (s.next.target - from)));
  const goal = t.goal(s.next.target, s.next.firstTime);

  return (
    <View className="flex-1 bg-ink-950">
      <View className="flex-row items-center justify-between px-6" style={{ paddingTop: insets.top + 8 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} className="py-2 active:opacity-60">
          <Text className="text-[15px] font-medium text-chalk-mute">{t.close}</Text>
        </Pressable>
        <Text className="text-[17px] font-semibold tracking-tight text-chalk">{t.detailTitle}</Text>
        <View className="w-14" />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 28, paddingBottom: insets.bottom + 32 }}>
        {/* Hero */}
        <View className="items-center">
          <StreakMark size={104} state={markStateFor(s)} milestone={s.milestoneToday !== null} anim={moving ? c : null} />
          <View className="mt-4">
            <RollingCount
              value={s.current}
              from={moving ? (c.run?.from ?? null) : null}
              roll={c.roll}
              size={56}
              color={s.current === 0 ? FAINT : INK}
            />
          </View>
          <Text className="mt-1 text-[15px] text-chalk-mute" maxFontSizeMultiplier={1.4}>
            {t.unit(s.current)}
          </Text>
        </View>

        <Animated.View
          className="mt-6"
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
          <StreakStatus s={s} t={t} centered showNext={false} />
        </Animated.View>

        {!s.doneToday ? (
          <View className="mt-5">
            <Button variant="primary" size="lg" fullWidth onPress={() => router.push("/review")}>
              {t.cta}
            </Button>
          </View>
        ) : null}

        {/* Record and total */}
        <View className="mt-8 flex-row gap-4">
          <StatCard label={t.record} value={t.days(s.best)} />
          {/* Just the number: the label already says what it counts. */}
          <StatCard label={t.reviewedDays} value={String(s.total)} />
        </View>

        {/* Next milestone */}
        <View className="mt-4 rounded-card border border-line bg-ink-850 p-5">
          <Eyebrow>{t.next}</Eyebrow>
          <Text className="mt-1.5 text-[20px] font-bold tracking-tight text-chalk">{capitalizeFirst(goal)}</Text>
          <View className="mt-4 h-2 overflow-hidden rounded-pill bg-ink-700">
            <View className="h-2 rounded-pill bg-chalk" style={{ width: `${Math.round(progress * 100)}%` }} />
          </View>
          <Text className="mt-2 text-[13px] text-chalk-mute">{t.remaining(s.next.remaining, goal)}</Text>
        </View>

        {/* Ladder */}
        <View className="mt-8">
          <Eyebrow>{t.ladder}</Eyebrow>
          <View className="mt-3 flex-row justify-between">
            {MILESTONES.map((m) => {
              const reached = s.best >= m;
              const isNext = !reached && m === s.next.target;
              return (
                <View
                  key={m}
                  accessibilityLabel={reached ? `${t.rung(m)}: ${t.a11yReached}` : t.rung(m)}
                  className={`h-10 w-10 items-center justify-center rounded-full ${
                    reached ? "bg-chalk" : isNext ? "border-2 border-chalk" : "border border-line-strong"
                  }`}
                >
                  <Text
                    maxFontSizeMultiplier={1.1}
                    style={{
                      fontSize: m >= 100 ? 10.5 : 12.5,
                      fontWeight: "700",
                      color: reached ? "#FFFFFF" : isNext ? INK : "#8E8E93",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {t.rung(m)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* History */}
        <View className="mt-8">
          <Eyebrow>{t.history}</Eyebrow>
          <View className="mt-2 flex-row items-center justify-between">
            <Pressable
              onPress={() => shift(-1)}
              disabled={!canPrev}
              hitSlop={10}
              accessibilityLabel={t.previousMonth}
              className={`p-2 active:opacity-60 ${canPrev ? "" : "opacity-20"}`}
            >
              <View style={{ transform: [{ rotate: "180deg" }] }}>
                <ChevronRightIcon size={18} />
              </View>
            </Pressable>
            <Text className="text-[15px] font-semibold text-chalk">{monthLabel}</Text>
            <Pressable
              onPress={() => shift(1)}
              disabled={!canNext}
              hitSlop={10}
              accessibilityLabel={t.nextMonth}
              className={`p-2 active:opacity-60 ${canNext ? "" : "opacity-20"}`}
            >
              <ChevronRightIcon size={18} />
            </Pressable>
          </View>

          <View className="mt-2 flex-row">
            {t.weekInitials.map((w, i) => (
              <Text key={i} className="flex-1 text-center text-[11px] font-medium text-chalk-mute">
                {w}
              </Text>
            ))}
          </View>
          {rows.map((row, r) => (
            <View key={r} className="mt-1.5 flex-row">
              {row.map((cell, i) => (
                <View
                  key={cell?.key ?? `pad-${r}-${i}`}
                  className="flex-1 items-center"
                  accessible={!!cell}
                  accessibilityLabel={cell ? t.a11yDay(dayLabel(cell.date), t.a11yMarks[cell.mark]) : undefined}
                >
                  {cell ? <DayDot mark={cell.mark} size={34} number={cell.date.getDate()} /> : <View style={{ height: 34 }} />}
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text className="mt-8 text-[13px] leading-relaxed text-chalk-mute">{t.rule}</Text>
        <Text className="mt-2 text-[13px] leading-relaxed text-chalk-mute">{t.lapse}</Text>
      </ScrollView>
    </View>
  );
}
