/**
 * One dependent's spending, for their guardian: the month against the one
 * before, by category, against the budgets, and every entry — new ones arrive
 * live. Read only through family_transactions / family_dependent_overview,
 * which check the consent and record the access (the dependent sees it in
 * their history).
 */
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { familyApi, type BankEntry } from "@/lib/backend/family";
import { CONNECTION_LABEL } from "@/lib/family/copy";
import { isInternal, type FamilyCategory } from "@/lib/family/categories";
import { budgetLines, byDay, currenciesOf, formatMoney, loadWindow, summarize } from "@/lib/family/summary";
import { reportHtml } from "@/lib/family/report";
import { Button, Group, GroupRow, Segmented } from "~/components/ui";
import { shareReportPdf } from "~/features/family/files";
import { useFamily, useFamilyLive } from "~/features/family/FamilyProvider";
import { useFamilyQuery } from "~/features/family/useFamilyQuery";
import { Badge, Bar, Choices, Empty, Failed, FamilyScroll, Loading, Notice, SavedNotice, Section, Tile } from "~/features/family/ui";

const PAGE = 500;
const MAX_PAGES = 4;

async function loadEntries(dependentId: string): Promise<BankEntry[]> {
  const { from, to } = loadWindow();
  const all: BankEntry[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await familyApi.transactions(dependentId, from, to, PAGE, page * PAGE);
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long" });

export default function DependentDashboard() {
  useFamilyLive();
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const { state, refresh } = useFamily();
  const g = state?.guardian_of;
  const dependent = g?.dependents.find((d) => d.user_id === id);
  const overview = useFamilyQuery(id ? `overview-${id}` : null, () => familyApi.overview(id), { live: true });
  const feed = useFamilyQuery(id ? `feed-${id}` : null, () => loadEntries(id), { live: true });
  const [period, setPeriod] = useState<"this" | "last">("this");
  const [filter, setFilter] = useState<FamilyCategory | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const now = useMemo(() => {
    const d = new Date();
    return period === "this" ? d : new Date(d.getFullYear(), d.getMonth() - 1, 15);
  }, [period]);
  const all = useMemo(() => feed.data ?? [], [feed.data]);
  // Banks in several countries mean several currencies; totals are only ever
  // added up within one, chosen here (the most used first).
  const currencies = useMemo(() => currenciesOf(all), [all]);
  const [currencyPick, setCurrencyPick] = useState<string | null>(null);
  const currency = currencyPick && currencies.includes(currencyPick) ? currencyPick : (currencies[0] ?? "BRL");
  const entries = useMemo(() => all.filter((e) => e.currency === currency), [all, currency]);
  const s = useMemo(() => summarize(entries, now), [entries, now]);
  const budgets = useMemo(
    () => budgetLines((overview.data?.budgets ?? []).filter((b) => (b.currency ?? "BRL") === currency), entries, now),
    [overview.data, entries, now, currency],
  );
  const monthEntries = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
    return entries.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= start && t < end && (!filter || e.category === filter);
    });
  }, [entries, now, filter]);

  const name = dependent?.display_name ?? "";
  const header = <Stack.Screen options={{ title: name }} />;
  const ended = feed.error?.code === "no_access" || overview.error?.code === "no_access" || (state && !dependent);

  if (ended) {
    return (
      <>
        {header}
        <FamilyScroll>
          <Notice tone="warn" title="Sharing ended">
            {name || "This person"} is no longer sharing with you, so their spending isn't available. Nothing of theirs is kept on this phone.
          </Notice>
          <View className="mt-4">
            <Button variant="secondary" onPress={() => { void refresh(); router.back(); }}>
              Back to Family
            </Button>
          </View>
        </FamilyScroll>
      </>
    );
  }
  if (feed.loading || overview.loading) return (<>{header}<Loading label={`Loading ${name}'s spending…`} /></>);
  if (!feed.data && feed.error) return (<>{header}<Failed message={feed.error.message} onRetry={() => void feed.reload()} /></>);

  const o = overview.data;
  const broken = (o?.connections ?? []).filter((c) => c.status !== "active" && c.status !== "updating");
  const locked = (o?.accounts ?? []).filter((a) => a.locked).length;
  const previousName = monthFmt.format(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const changeText =
    s.change.direction === "flat" ? `Same as ${previousName}` : `${s.change.pct}% ${s.change.direction === "up" ? "more" : "less"} than ${previousName}`;
  const paid = g?.plan === "paid";

  const makeReport = async () => {
    if (!g || !dependent) return;
    setReportBusy(true);
    setReportError(null);
    try {
      const html = reportHtml({
        dependentName: dependent.display_name,
        familyName: g.family.name,
        entries,
        budgets: (o?.budgets ?? []).filter((b) => (b.currency ?? "BRL") === currency),
        currency,
        now,
        generatedBy: g.display_name,
      });
      await shareReportPdf(html, `${dependent.display_name} — ${monthFmt.format(now)}`);
    } catch (e) {
      setReportError((e as Error).message);
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <>
      {header}
      <FamilyScroll onRefresh={() => { void feed.reload(); void overview.reload(); }} refreshing={feed.refreshing}>
        <SavedNotice savedAt={feed.savedAt} />

        <Segmented
          options={[
            { value: "this", label: "This month" },
            { value: "last", label: "Last month" },
          ]}
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setFilter(null);
          }}
          role="tab"
        />

        {currencies.length > 1 ? (
          <View className="mt-4">
            <Choices
              label="Currency"
              value={currency}
              onChange={(c) => {
                setCurrencyPick(c);
                setFilter(null);
              }}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
            <Text className="mt-2 text-caption text-chalk-mute">Accounts in different currencies are shown one currency at a time.</Text>
          </View>
        ) : null}

        {broken.map((c) => (
          <Notice key={c.id} tone="alert" title={`${c.institution}: ${CONNECTION_LABEL[c.status]}`}>
            New purchases from this bank won't appear until {name} reconnects it. They see the same notice on their phone.
          </Notice>
        ))}
        {locked ? (
          <Notice tone="warn" title={`${locked} shared account${locked === 1 ? "" : "s"} locked`}>
            The free plan shows one shared account. A Flow subscription shows them all.
          </Notice>
        ) : null}

        {(o?.accounts ?? []).length === 0 ? (
          <Empty title={`${name} hasn't shared an account yet`}>
            They connect a bank and choose which accounts to share. You'll see entries from then on.
          </Empty>
        ) : (
          <>
            <View className="mt-6 flex-row gap-3">
              <Tile label={`Spent in ${monthFmt.format(now)}`} value={formatMoney(s.spent, currency)} sub={changeText} />
            </View>
            <View className="mt-3 flex-row gap-3">
              <Tile label={`In ${previousName}`} value={formatMoney(s.previous, currency)} />
              <Tile label="Received" value={formatMoney(s.income, currency)} />
            </View>

            <Section label="By category">
              {s.categories.length === 0 ? (
                <Text className="text-footnote text-chalk-mute">No spending this month.</Text>
              ) : (
                <View className="gap-4">
                  {s.categories.map((c) => {
                    const on = filter === c.category;
                    return (
                      <Pressable
                        key={c.category}
                        onPress={() => setFilter(on ? null : (c.category as FamilyCategory))}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        accessibilityHint={on ? "Shows every entry again" : "Shows only this category's entries"}
                        className="active:opacity-60"
                      >
                        <View className="flex-row items-baseline justify-between gap-3">
                          <Text className={`min-w-0 flex-1 text-body ${on ? "font-semibold text-chalk" : "text-chalk"}`}>{c.category}</Text>
                          <Text className="text-body font-medium text-chalk">{formatMoney(c.total, currency)}</Text>
                          <Text className="w-10 text-right text-footnote text-chalk-mute">{c.pct}%</Text>
                        </View>
                        <Bar pct={c.pct} label={`${c.category}, ${c.pct}% of spending`} />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Section>

            <Section label="Budgets" footer="Limits to follow, not blocks: nothing stops a purchase.">
              {budgets.length === 0 ? (
                <Text className="text-footnote text-chalk-mute">No budgets yet.</Text>
              ) : (
                <View className="gap-4">
                  {budgets.map((b) => (
                    <View key={b.category}>
                      <View className="flex-row items-baseline justify-between gap-3">
                        <Text className="min-w-0 flex-1 text-body text-chalk">{b.category === "total" ? "All spending" : b.category}</Text>
                        <Text className={`text-footnote ${b.over ? "font-semibold text-signal-alert" : "text-chalk-mute"}`}>
                          {formatMoney(b.spent, currency)} of {formatMoney(b.limit, currency)}
                        </Text>
                      </View>
                      <Bar pct={b.pct} over={b.over} label={`${b.category === "total" ? "All spending" : b.category} budget`} />
                    </View>
                  ))}
                </View>
              )}
              <View className="mt-4">
                <Button variant="secondary" onPress={() => router.push({ pathname: "/family/budgets", params: { dependent: id } })}>
                  {budgets.length ? "Edit budgets" : "Set a budget"}
                </Button>
              </View>
            </Section>

            <Section label={filter ? `Entries · ${filter}` : "Entries"}>
              {filter ? (
                <View className="mb-3">
                  <Button variant="ghost" size="sm" onPress={() => setFilter(null)}>
                    Show all categories
                  </Button>
                </View>
              ) : null}
              {monthEntries.length === 0 ? (
                <Text className="text-footnote text-chalk-mute">No entries.</Text>
              ) : (
                byDay(monthEntries).map((d) => (
                  <View key={d.day} className="mb-4">
                    <Text className="mb-1 text-caption font-semibold uppercase text-chalk-mute" accessibilityRole="header">
                      {dayFmt.format(new Date(`${d.day}T12:00:00`))}
                    </Text>
                    <Group>
                      {d.entries.map((e) => (
                        <EntryRow key={e.id} entry={e} />
                      ))}
                    </Group>
                  </View>
                ))
              )}
            </Section>
          </>
        )}

        <Section label="More">
          <Group>
            <GroupRow title="Alerts for this person" sub="Large purchases, betting, budgets, connection" onPress={() => router.push({ pathname: "/family/alerts", params: { dependent: id } })} />
            <GroupRow
              title="Monthly report (PDF)"
              sub={paid ? (reportBusy ? "Preparing…" : `${monthFmt.format(now)}, to save or print`) : "Included with a Flow subscription"}
              onPress={paid && !reportBusy ? () => void makeReport() : undefined}
            />
          </Group>
          {reportError ? <Notice tone="alert">{reportError}</Notice> : null}
        </Section>
      </FamilyScroll>
    </>
  );
}

function EntryRow({ entry: e }: { entry: BankEntry }) {
  const internal = isInternal(e.category);
  const amount = `${e.direction === "income" ? "+" : ""}${formatMoney(e.amount, e.currency)}`;
  return (
    <View
      className="flex-row items-center gap-3 px-4 py-3"
      accessible
      accessibilityLabel={`${e.merchant || e.description || "Entry"}, ${e.category}, ${amount}${e.status === "pending" ? ", pending" : ""}${internal ? ", not counted" : ""}`}
    >
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-body text-chalk">
          {e.merchant || e.description || "—"}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-caption text-chalk-mute">
          {e.category}
          {internal ? " · not counted" : ""}
        </Text>
      </View>
      <View className="items-end">
        <Text className={`text-body font-medium ${e.direction === "income" ? "text-signal-ok" : "text-chalk"}`}>{amount}</Text>
        {e.status === "pending" ? <Badge>Pending</Badge> : null}
      </View>
    </View>
  );
}
