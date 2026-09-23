/**
 * The daily review — the one action that counts a day toward the streak.
 *
 * Deliberately small: today's entries, the charges coming up, a way to add
 * whatever is missing, and a confirmation. It's a useful habit on its own —
 * catching the coffee you forgot to log, seeing tomorrow's renewal coming — and
 * it works the same on a day with no spending at all, which counts as fully as
 * any other. Nothing here asks you to spend, log more, or save a set amount.
 */
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { Money } from "@/lib/money";
import { dayKey, fromDayKey } from "@/lib/streak";
import { daysUntil } from "@/lib/recurrence";
import { capitalizeFirst } from "@/lib/format";
import { Button, Eyebrow } from "~/components/ui";
import { CheckIcon, PlusIcon } from "~/components/icons";
import { streakCopy } from "~/features/streak/copy";
import { useTodayKey } from "~/features/streak/useTodayKey";

/** How far ahead "coming up" looks. Far enough to act on, near enough to matter. */
const UPCOMING_DAYS = 3;

export default function Review() {
  const insets = useSafeAreaInsets();
  const { data, reviewDay } = useStore();
  const money = useMoney();
  const t = useMemo(() => streakCopy(), []);
  const todayKey = useTodayKey();
  const today = useMemo(() => fromDayKey(todayKey), [todayKey]);
  const done = data.activeDays.includes(todayKey);

  const [saving, setSaving] = useState(false);
  // One confirmation, however fast the taps — the same guard as account deletion.
  const held = useRef(false);

  const entries = useMemo(
    () =>
      data.transactions
        .filter((x) => dayKey(new Date(x.date)) === todayKey)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [data.transactions, todayKey],
  );
  const outflow = Money.sum(entries.filter((x) => x.direction === "expense").map((x) => x.amount));
  const inflow = Money.sum(entries.filter((x) => x.direction === "income").map((x) => x.amount));

  const upcoming = useMemo(
    () =>
      data.subscriptions
        .filter((s) => s.status === "active" || s.status === "trial")
        .map((s) => ({ s, days: daysUntil(s.nextChargeAt, today) }))
        .filter(({ days }) => days >= 0 && days <= UPCOMING_DAYS)
        .sort((a, b) => a.days - b.days),
    [data.subscriptions, today],
  );

  const dateLabel = capitalizeFirst(
    new Intl.DateTimeFormat(t.locale, { weekday: "long", day: "numeric", month: "long" }).format(today),
  );

  const confirm = async () => {
    if (held.current || done) return;
    held.current = true;
    setSaving(true);
    try {
      await reviewDay(todayKey);
      // Back to where the review was opened from; the streak there picks up
      // the new day and plays its moment.
      router.back();
    } catch {
      held.current = false;
      setSaving(false);
      Alert.alert(t.errorTitle, t.errorBody);
    }
  };

  return (
    <View className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, paddingHorizontal: 24 }}
      >
        <View className="flex-row items-center justify-between">
          <Pressable onPress={() => router.back()} hitSlop={8} className="py-2 active:opacity-60">
            <Text className="text-[15px] font-medium text-chalk-mute">{t.close}</Text>
          </Pressable>
          <Text className="text-[17px] font-semibold tracking-tight text-chalk">{t.reviewTitle}</Text>
          <View className="w-14" />
        </View>

        <Text className="mt-8 text-[26px] font-bold tracking-tight text-chalk">{dateLabel}</Text>
        <Text className="mt-2 text-[14px] leading-relaxed text-chalk-mute">{t.rule}</Text>

        <View className="mt-8">
          <Eyebrow>{t.today}</Eyebrow>
          {entries.length > 0 ? (
            <View className="mt-1">
              {entries.map((x) => (
                <View key={x.id} className="flex-row items-center gap-3 border-b border-line-soft py-3.5">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
                      {x.description}
                    </Text>
                    <Text numberOfLines={1} className="mt-0.5 text-[13px] text-chalk-mute">
                      {x.merchant || x.categoryId}
                    </Text>
                  </View>
                  <Text className="shrink-0 text-[15px] font-semibold text-chalk">
                    {x.direction === "income" ? "+" : "−"}
                    {money.format(x.amount)}
                  </Text>
                </View>
              ))}
              <Text className="mt-3 text-[13px] text-chalk-mute">
                {t.outflow} {money.format(outflow)}
                {inflow > 0 ? `  ·  ${t.inflow} ${money.format(inflow)}` : ""}
              </Text>
            </View>
          ) : (
            <View className="mt-3 rounded-card border border-dashed border-line-strong px-5 py-6">
              <Text className="text-center text-[15px] font-medium text-chalk">{t.noEntries}</Text>
              <Text className="mt-1 text-center text-[13px] text-chalk-mute">{t.noEntriesNote}</Text>
            </View>
          )}

          <Pressable
            onPress={() => router.push("/add-expense")}
            className="mt-3 flex-row items-center gap-2 self-start py-2 active:opacity-60"
          >
            <PlusIcon size={16} strokeWidth={2.2} />
            <Text className="text-[14px] font-semibold text-chalk">{t.addMissing}</Text>
          </Pressable>
        </View>

        {upcoming.length > 0 ? (
          <View className="mt-8">
            <Eyebrow>{t.upcoming}</Eyebrow>
            <View className="mt-1">
              {upcoming.map(({ s, days }) => (
                <View key={s.id} className="flex-row items-center gap-3 border-b border-line-soft py-3.5">
                  <View className="min-w-0 flex-1">
                    <Text numberOfLines={1} className="text-[15px] font-medium text-chalk">
                      {s.name}
                    </Text>
                    <Text className="mt-0.5 text-[13px] text-chalk-mute">{capitalizeFirst(t.when(days))}</Text>
                  </View>
                  <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(s.amount)}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View className="border-t border-line-soft px-6 pt-4" style={{ paddingBottom: insets.bottom + 16 }}>
        {done ? (
          <View className="items-center py-2">
            <View className="flex-row items-center gap-2">
              <CheckIcon size={16} strokeWidth={2.4} />
              <Text className="text-[15px] font-semibold text-chalk">{t.alreadyDone}</Text>
            </View>
            <Text className="mt-1 text-[13px] text-chalk-mute">{t.alreadyDoneBody}</Text>
          </View>
        ) : (
          <Button variant="primary" size="lg" fullWidth disabled={saving} onPress={confirm}>
            {saving ? t.saving : t.confirm}
          </Button>
        )}
      </View>
    </View>
  );
}
