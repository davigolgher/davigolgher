/**
 * Alerts: the ones received, and the rules that make them — per dependent.
 *
 * Push permission is asked when the guardian turns a rule on, not before. A
 * notification only says there is an alert and about whom; the details are
 * here, behind the guardian's sign-in.
 */
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { familyApi, type AlertKind, type Overview } from "@/lib/backend/family";
import { BUDGET_CATEGORIES, DEFAULT_SENSITIVE, type FamilyCategory } from "@/lib/family/categories";
import { ALERT_RULE_HINT, ALERT_RULE_LABEL, describeAlert } from "@/lib/family/copy";
import { currencySymbol } from "@/lib/family/summary";
import { amountTextToCents, centsToAmountText, sanitizeAmountText } from "~/lib/amount";
import { Button, Group, GroupRow, Input, PressableScale } from "~/components/ui";
import { registerForAlerts } from "~/features/family/push";
import { useFamily, useFamilyLive } from "~/features/family/FamilyProvider";
import { useFamilyQuery } from "~/features/family/useFamilyQuery";
import { Empty, FamilyScroll, Loading, Notice, SavedNotice, Section, SwitchRow } from "~/features/family/ui";
import { hapticSelection } from "~/lib/haptics";

const KINDS: AlertKind[] = ["large_purchase", "sensitive_category", "budget_exceeded", "connection_expired"];
const PAID_ONLY: AlertKind[] = ["sensitive_category", "budget_exceeded"];
const timeFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export default function Alerts() {
  useFamilyLive();
  const { dependent } = useLocalSearchParams<{ dependent?: string }>();
  const { state } = useFamily();
  const g = state?.guardian_of;
  const inbox = useFamilyQuery(state && g ? "alerts" : null, () => familyApi.alerts(state!.user_id, 100), { live: true });
  const names = new Map((g?.dependents ?? []).map((d) => [d.user_id, d.display_name]));
  const shown = (inbox.data ?? []).filter((a) => !dependent || a.dependent_id === dependent);

  // Seen is read: mark what's on screen.
  useEffect(() => {
    const unread = shown.filter((a) => !a.read_at).map((a) => a.id);
    if (unread.length) void familyApi.markAlertsRead(unread).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inbox.data]);

  if (!g) return <Loading />;
  const people = g.dependents.filter((d) => d.consent?.status === "active" && !d.locked && (!dependent || d.user_id === dependent));

  return (
    <FamilyScroll onRefresh={() => void inbox.reload()} refreshing={inbox.refreshing}>
      <SavedNotice savedAt={inbox.savedAt} />

      {people.map((d) => (
        <Rules key={d.user_id} familyId={g.family.id} dependentId={d.user_id} name={d.display_name} paid={g.plan === "paid"} />
      ))}

      <Section label="Received">
        {inbox.loading ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty title="No alerts yet">They'll appear here, and as a notification if you allow them.</Empty>
        ) : (
          <Group>
            {shown.map((a) => {
              const who = names.get(a.dependent_id) ?? "Someone";
              return (
                <GroupRow
                  key={a.id}
                  title={describeAlert(a.kind, who, a.detail)}
                  sub={`${timeFmt.format(new Date(a.created_at))}${a.read_at ? "" : " · new"}`}
                  onPress={names.has(a.dependent_id) ? () => router.push(`/family/dependent/${a.dependent_id}`) : undefined}
                />
              );
            })}
          </Group>
        )}
      </Section>
    </FamilyScroll>
  );
}

function Rules({ familyId, dependentId, name, paid }: { familyId: string; dependentId: string; name: string; paid: boolean }) {
  const overview = useFamilyQuery<Overview>(`overview-${dependentId}`, () => familyApi.overview(dependentId), { live: true });
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [push, setPush] = useState<string | null>(null);
  const rules = overview.data?.rules ?? [];
  const rule = (k: AlertKind) => rules.find((r) => r.kind === k);
  // The amount is in a currency: the rule's, else the one most of the shared accounts use.
  const accountCurrencies = [...new Set((overview.data?.accounts ?? []).map((a) => a.currency))];
  const currency = rule("large_purchase")?.currency ?? accountCurrencies[0] ?? "BRL";

  useEffect(() => {
    const t = rule("large_purchase")?.threshold;
    if (t && !threshold) setThreshold(centsToAmountText(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overview.data]);

  const set = async (kind: AlertKind, enabled: boolean, extra: { threshold?: number | null; categories?: FamilyCategory[] | null; currency?: string } = {}) => {
    setError(null);
    try {
      await familyApi.setRule({ familyId, dependentId, kind, enabled, ...extra });
      await overview.reload();
      if (enabled) {
        const res = await registerForAlerts();
        setPush(
          res === "denied"
            ? "Notifications are off for Flow. Alerts still appear here; turn notifications on in Settings to get them on your phone."
            : res === "unavailable"
              ? "Notifications aren't available in this build. Alerts still appear here."
              : null,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (overview.loading) return <Loading />;
  const sensitive = rule("sensitive_category")?.categories ?? DEFAULT_SENSITIVE;
  const cents = amountTextToCents(threshold);

  return (
    <Section label={`Alerts about ${name}`} footer={paid ? undefined : "Category and budget alerts come with a Flow subscription."}>
      {error ? <Notice tone="alert">{error}</Notice> : null}
      {push ? (
        <Notice tone="warn" action={<Button variant="secondary" size="sm" onPress={() => void Linking.openSettings()}>Open Settings</Button>}>
          {push}
        </Notice>
      ) : null}
      <Group>
        {KINDS.map((k) => {
          const r = rule(k);
          const locked = PAID_ONLY.includes(k) && !paid;
          return (
            <SwitchRow
              key={k}
              title={ALERT_RULE_LABEL[k]}
              sub={locked ? "With a Flow subscription" : ALERT_RULE_HINT[k]}
              value={Boolean(r?.enabled) && !locked}
              disabled={locked || (k === "large_purchase" && !r?.enabled && cents <= 0)}
              onChange={(on) =>
                void set(k, on, k === "large_purchase" ? { threshold: cents > 0 ? cents : null, currency } : k === "sensitive_category" ? { categories: sensitive } : {})
              }
            />
          );
        })}
      </Group>

      <View className="mt-4">
        <Text className="text-caption text-chalk-mute">
          Alert for a single purchase from{accountCurrencies.length > 1 ? ` (in ${currency}; purchases in other currencies don't count)` : ""}
        </Text>
        <View className="mt-2 flex-row items-center gap-2">
          <Input
            value={threshold}
            onChangeText={(t) => setThreshold(sanitizeAmountText(t))}
            keyboardType="decimal-pad"
            placeholder="e.g. 200"
            className="flex-1"
            accessibilityLabel="Large purchase amount"
            leading={<Text className="text-callout text-chalk-mute">{currencySymbol(currency)}</Text>}
          />
          <Button variant="primary" disabled={cents <= 0} onPress={() => void set("large_purchase", true, { threshold: cents, currency })}>
            Save
          </Button>
        </View>
      </View>

      {paid && rule("sensitive_category")?.enabled ? (
        <View className="mt-4">
          <Text className="text-caption text-chalk-mute">Sensitive categories</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {BUDGET_CATEGORIES.map((c) => {
              const on = sensitive.includes(c);
              return (
                <PressableScale
                  key={c}
                  onPress={() => {
                    hapticSelection();
                    const next = on ? sensitive.filter((x) => x !== c) : [...sensitive, c];
                    if (next.length) void set("sensitive_category", true, { categories: next });
                  }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  className={`rounded-pill border px-3.5 py-2 ${on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"}`}
                >
                  <Text className={`text-footnote font-medium ${on ? "text-ink-950" : "text-chalk"}`}>{c}</Text>
                </PressableScale>
              );
            })}
          </View>
        </View>
      ) : null}
    </Section>
  );
}
