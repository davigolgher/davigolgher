/**
 * Bank accounts: connect a bank and its purchases become your expenses.
 *
 * Presented as the way to a better Flow, not a technical chore: first what it
 * gets you (your last 90 days now, purchases that log themselves, the
 * subscriptions you forgot), then the promises (read-only, your password
 * never reaches Flow, leave any time and keep or delete what came in), then
 * one button. Every state of a connection is on this screen: opening,
 * reading, connected, needs attention at the bank, failed, reconnecting.
 *
 * Nothing here is required. "Not now" goes back to typing expenses by hand,
 * which works exactly as before.
 */
import { useMemo, useState } from "react";
import { Alert, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useStore } from "@/data/store";
import { bankApi, needingAttention, untouched, type BankConnection } from "@/lib/backend/banks";
import { CONNECTION_LABEL } from "@/lib/family/copy";
import { BANK_HINT } from "@/lib/backend/banks";
import { PROVIDER_NAME } from "@/lib/family/countries";
import { detectSubscriptions } from "@/lib/detectSubscriptions";
import { useMoney } from "@/lib/useMoney";
import { Button, Group, GroupRow } from "~/components/ui";
import { Badge, Failed, Lead, Loading, Notice, Point, ScreenScroll, Section, SwitchRow } from "~/components/kit";
import { BankConnectIntro, useBankConnect } from "~/features/bank/BankConnect";
import { invalidateBankConnections, useBankConnections } from "~/features/bank/useBankConnections";
import { BankIcon, EyeIcon, ShieldIcon } from "~/features/family/icons";
import { BarChartIcon, RepeatIcon } from "~/components/icons";
import { hapticSuccess } from "~/lib/haptics";
import { track } from "~/lib/analytics";
import { useSampleMode } from "~/features/sample/SampleMode";
import { useEffect } from "react";
import { colors, iconSize } from "~/theme/tokens";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const KIND: Record<string, string> = { checking: "Account", savings: "Savings", credit_card: "Card" };

type Result = { inserted: number; banks: number } | null;

export default function Banks() {
  const { data: store, refresh, setCurrency } = useStore();
  const money = useMoney();
  const q = useBankConnections();
  const [adding, setAdding] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const currency = store.preferences.currency;

  useFocusEffect(
    useCallback(() => {
      void q.reload();
    }, [q.reload]),
  );

  /**
   * Just connected: switch on every account in the person's Flow currency,
   * then read the last 90 days into Flow. Accounts in another currency wait
   * for the person's choice (Flow totals one currency).
   */
  const bring = async () => {
    setPreparing(true);
    try {
      const list = await bankApi.list();
      const fresh = list.filter(untouched);
      // Someone with nothing in Flow yet takes their bank's currency: their
      // first bank in another currency would otherwise bring nothing in.
      let target = currency;
      const theirs = [...new Set(fresh.flatMap((c) => c.accounts.map((a) => a.currency)))];
      if (store.transactions.length === 0 && theirs.length === 1 && theirs[0] !== currency) {
        target = theirs[0];
        setCurrency(target);
      }
      let inserted = 0;
      for (const c of fresh) {
        await bankApi.importDefaults(c.id, target);
        const read = await bankApi.sync({ connectionId: c.id }).catch(() => null);
        inserted += read?.inserted ?? 0;
      }
      setResult({ inserted, banks: fresh.length });
      track("bank_import_completed", { banks: fresh.length, entries: inserted });
      if (fresh.length) hapticSuccess();
      refresh();
    } catch (e) {
      setActionError((e as Error).message);
      track("bank_sync_failed", { stage: "first_import" });
    } finally {
      setPreparing(false);
      invalidateBankConnections();
    }
  };

  const bank = useBankConnect((done) => {
    setAdding(false);
    if (done) {
      track("bank_connect_succeeded", { accounts: done.accounts });
      void bring();
    } else {
      track("bank_connect_failed", { stage: "first_read" });
      invalidateBankConnections();
    }
  });

  const start = (country: string) => {
    setResult(null);
    track("bank_connect_started", { country });
    void bank.start({ country });
  };

  const toggle = async (conn: BankConnection, accountId: string, on: boolean) => {
    setBusyAccount(accountId);
    setActionError(null);
    try {
      await bankApi.setImport(accountId, on);
      if (on) await bankApi.sync({ connectionId: conn.id }).catch(() => null);
      track("bank_account_import_set", { on });
      refresh();
      await q.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusyAccount(null);
    }
  };

  const update = async (conn: BankConnection) => {
    setActionError(null);
    try {
      const res = await bankApi.sync({ connectionId: conn.id });
      track("bank_sync_succeeded", { entries: res.inserted, manual: true });
      refresh();
    } catch (e) {
      track("bank_sync_failed", { stage: "manual" });
      setActionError((e as Error).message);
    } finally {
      await q.reload();
    }
  };

  const disconnect = (conn: BankConnection) => {
    const go = async (keepImported: boolean) => {
      setActionError(null);
      try {
        await bankApi.disconnect(conn.id, keepImported);
        track("bank_disconnected", { kept: keepImported });
        refresh();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        invalidateBankConnections();
      }
    };
    Alert.alert(
      `Disconnect ${conn.institution_name || "this bank"}?`,
      "Flow stops reading it and the consent at your bank ends. What it brought into Flow can stay as your own expenses, or go with it.",
      [
        { text: "Disconnect, keep expenses", onPress: () => void go(true) },
        { text: "Disconnect and delete them", style: "destructive", onPress: () => void go(false) },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const connections = q.data ?? [];
  const attention = needingAttention(connections);
  const found = useMemo(
    () => (result ? detectSubscriptions(store.transactions, store.subscriptions, new Set(), new Date()) : []),
    [result, store.transactions, store.subscriptions],
  );

  const none = (q.data ?? []).length === 0;
  useEffect(() => {
    if (q.data && none) track("bank_intro_viewed");
  }, [q.data, none]);

  if (store.isSimulated) return <SampleBanks />;
  if (!q.data && q.loading) return <Loading label="Checking your banks…" />;
  if (!q.data && q.error) return <Failed message={q.error} onRetry={() => void q.reload()} />;

  return (
    <ScreenScroll onRefresh={() => void q.reload()} refreshing={q.loading && Boolean(q.data)}>
      {preparing ? <Loading label="Bringing in your last 90 days…" /> : null}

      {result && !preparing ? (
        <Notice
          tone="ok"
          title={result.inserted > 0 ? `${result.inserted} purchases are now in Flow` : "Bank connected"}
          action={
            <View className="gap-2">
              <Button variant="primary" fullWidth onPress={() => router.replace("/")}>
                See your month
              </Button>
              {found.length > 0 ? (
                <Button variant="secondary" fullWidth onPress={() => router.replace("/subs")}>
                  {`Review ${found.length} possible subscription${found.length === 1 ? "" : "s"}`}
                </Button>
              ) : null}
            </View>
          }
        >
          {result.inserted > 0
            ? `Your last 90 days, already in categories.${found.length ? ` We also spotted ${found.length} charge${found.length === 1 ? "" : "s"} that repeat every month — ${money.format(found.reduce((s, c) => s + c.monthly, 0))} a month.` : ""}`
            : "New purchases will appear here as your bank reports them. It can take a few minutes the first time."}
        </Notice>
      ) : null}

      {attention.map((c) => (
        <Notice
          key={`attention-${c.id}`}
          tone={c.status === "error" ? "warn" : "alert"}
          title={`${c.institution_name || "A bank"}: ${CONNECTION_LABEL[c.status]}`}
          action={
            <Button
              variant="secondary"
              disabled={bank.busy}
              onPress={() => {
                track("bank_reconnect_started", { kind: c.status });
                void bank.start({ connectionId: c.id, provider: c.provider, itemId: c.external_item_id });
              }}
            >
              {c.status === "error" ? "Try again" : "Reconnect"}
            </Button>
          }
        >
          {BANK_HINT[c.status]}
        </Notice>
      ))}

      {bank.error ? <Notice tone="alert" title="The connection didn't finish">{`${bank.error} You can try again, or keep adding expenses by hand.`}</Notice> : null}
      {actionError ? <Notice tone="alert">{actionError}</Notice> : null}

      {none ? (
        <View className="mt-4">
          <Text className="text-title font-bold text-chalk" accessibilityRole="header">
            Your bank, in Flow
          </Text>
          <Lead>Connect once and your spending fills itself in. No typing, no receipts.</Lead>
          <View className="mt-6 gap-5">
            <Point icon={<BarChartIcon size={iconSize.lg} color={colors.chalk.DEFAULT} />} title="Your last 90 days, right away">
              Every purchase, sorted into categories, the moment you connect.
            </Point>
            <Point icon={<RepeatIcon size={iconSize.lg} color={colors.chalk.DEFAULT} />} title="The subscriptions you forgot">
              Flow spots charges that repeat every month and offers to track them.
            </Point>
            <Point icon={<BankIcon size={iconSize.lg} />} title="New purchases log themselves">
              They arrive as your bank reports them. You can still edit or add anything.
            </Point>
          </View>
        </View>
      ) : null}

      {connections.map((c) => (
        <Section key={c.id} label={`${c.institution_name || "Bank"}${c.country_code ? ` · ${c.country_code}` : ""}`}>
          <View className="mb-2 flex-row flex-wrap items-center gap-2 px-1">
            <Badge tone={c.status === "active" ? "ok" : c.status === "updating" ? "info" : "warn"}>{CONNECTION_LABEL[c.status]}</Badge>
            <Text className="text-caption text-chalk-mute">
              {c.last_synced_at ? `Updated ${dateFmt.format(new Date(c.last_synced_at))}` : "Not read yet"} · {PROVIDER_NAME[c.provider]}
            </Text>
          </View>
          <Group>
            {c.accounts.length === 0 ? (
              <GroupRow title={c.status === "updating" ? "Reading your accounts…" : "No accounts found yet"} sub="Pull down to check again." />
            ) : (
              c.accounts.map((a) => (
                <SwitchRow
                  key={a.id}
                  title={`${KIND[a.kind] ?? "Account"}${a.last4 ? ` •••• ${a.last4}` : ""}${a.name ? ` · ${a.name}` : ""}`}
                  sub={
                    a.import_to_flow
                      ? `In your Flow${a.currency !== currency ? ` · in ${a.currency}` : ""}`
                      : a.currency !== currency
                        ? `In ${a.currency}; Flow totals ${currency}. Turn on to bring it in anyway.`
                        : "Not in your Flow"
                  }
                  value={Boolean(a.import_to_flow)}
                  disabled={busyAccount === a.id}
                  onChange={(on) => void toggle(c, a.id, on)}
                />
              ))
            )}
            <GroupRow title="Update now" sub="New purchases also arrive by themselves" onPress={() => void update(c)} />
            <GroupRow title="Disconnect this bank" onPress={() => disconnect(c)} />
          </Group>
        </Section>
      ))}

      {none || adding ? (
        <Section label={none ? "Connect" : "Another bank"}>
          <BankConnectIntro
            onStart={start}
            busy={bank.busy || preparing}
            note={
              <Notice title="You stay in control">
                {`Accounts in ${currency} go into Flow; you can switch any account off, and add more banks later.`}
              </Notice>
            }
          />
        </Section>
      ) : (
        <View className="mt-6">
          <Button variant="secondary" fullWidth onPress={() => setAdding(true)}>
            Connect another bank
          </Button>
        </View>
      )}

      <Section label="Your data">
        <View className="gap-4">
          <Point icon={<EyeIcon size={iconSize.lg} />} title="Read-only">
            Flow can see purchases. It can't move money, pay, or change anything at your bank.
          </Point>
          <Point icon={<ShieldIcon size={iconSize.lg} />} title="Your password never reaches Flow">
            You sign in on your bank's or a regulated provider's own page. Flow only receives what you approve there.
          </Point>
          <Point icon={<BankIcon size={iconSize.lg} />} title="Leave whenever you like">
            Disconnecting ends the consent at your bank. You choose whether what came in stays as your own expenses.
          </Point>
        </View>
      </Section>

      {none ? (
        <View className="mt-8">
          <Button variant="ghost" fullWidth onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}>
            Not now — I'll add expenses myself
          </Button>
        </View>
      ) : null}
      {bank.modal}
    </ScreenScroll>
  );
}

/** Exploring the sample: banks are for an account, so say so and offer one. */
function SampleBanks() {
  const { exit } = useSampleMode();
  return (
    <ScreenScroll>
      <Text className="mt-4 text-title font-bold text-chalk" accessibilityRole="header">
        Your bank, in Flow
      </Text>
      <Lead>
        Connected to your own account, your bank fills Flow in by itself: your last 90 days at once, then every purchase as it happens. Create
        an account to connect yours; the sample stays invented.
      </Lead>
      <View className="mt-6 gap-3">
        <Button variant="primary" fullWidth onPress={() => exit("signUp")}>
          Create my account
        </Button>
        <Button variant="ghost" fullWidth onPress={() => router.back()}>
          Back to the sample
        </Button>
      </View>
    </ScreenScroll>
  );
}
