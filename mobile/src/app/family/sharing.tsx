/**
 * Sharing, from the dependent's side: exactly who sees what, the alerts and
 * budgets set about them, every time their data was opened, and the controls
 * that end it — stop sharing (immediate), leave the family, download a copy
 * of their data.
 *
 * The terms point here by name ("Family → Sharing → Stop sharing",
 * "… → Access history"), so those words must stay.
 */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { familyApi, type DependentView } from "@/lib/backend/family";
import { CONSENT_DURATIONS, CONSENT_TERM_VERSION } from "@/lib/family/consentTerm";
import { ALERT_RULE_LABEL, describeActivity, END_REASON } from "@/lib/family/copy";
import { formatMoney } from "@/lib/family/summary";
import { Button, Group, GroupRow } from "~/components/ui";
import { shareMyData } from "~/features/family/files";
import { useFamily, useFamilyLive } from "~/features/family/FamilyProvider";
import { useFamilyQuery } from "~/features/family/useFamilyQuery";
import { Badge, Check, Choices, Empty, FamilyScroll, Loading, Notice, SavedNotice, Section } from "~/features/family/ui";
import { hapticSuccess } from "~/lib/haptics";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const timeFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const KIND: Record<string, string> = { checking: "Account", savings: "Savings", credit_card: "Card" };

export default function Sharing() {
  useFamilyLive();
  const { userId } = useAuth();
  const { state, loading, savedAt, refresh } = useFamily();
  const connections = useFamilyQuery("connections", familyApi.myConnections, { live: true });
  const about = useFamilyQuery(userId ? "about-me" : null, () => familyApi.aboutMe(userId!), { live: true });
  const activity = useFamilyQuery("activity", () => familyApi.activity(200), { live: true });
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  if (!state && loading) return <Loading />;
  const families = state?.dependent_of ?? [];

  const shared = (connections.data ?? []).flatMap((c) =>
    c.accounts.filter((a) => a.shared).map((a) => `${KIND[a.kind] ?? "Account"}${a.last4 ? ` •••• ${a.last4}` : ""} · ${c.institution_name || "Bank"}`),
  );
  const names = new Map<string, string>();
  for (const f of families) for (const g of f.guardians) names.set(g.user_id, g.display_name);
  const aboutMe = (activity.data ?? []).filter((a) => a.subject_id === userId);

  const download = async () => {
    setExporting(true);
    setError(null);
    try {
      await shareMyData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <FamilyScroll onRefresh={() => { void refresh(); void connections.reload(); void activity.reload(); void about.reload(); }}>
      <SavedNotice savedAt={savedAt ?? connections.savedAt} />
      {error ? <Notice tone="alert">{error}</Notice> : null}

      {families.length === 0 ? (
        <Empty title="You're not sharing with anyone" action={<Button variant="secondary" onPress={() => router.push("/family/join")}>Join with a code</Button>}>
          Nobody can see your spending.
        </Empty>
      ) : null}

      {families.map((f) => (
        <FamilySharing key={f.family.id} family={f} onChanged={() => void refresh()} setError={setError} />
      ))}

      {families.length > 0 ? (
        <>
          <Section label="What they see" footer="Only these accounts — including up to 90 days before you shared them — and only while you're sharing.">
            {shared.length ? (
              <Group>
                {shared.map((s) => (
                  <GroupRow key={s} title={s} />
                ))}
              </Group>
            ) : (
              <Text className="text-footnote text-chalk-mute">No accounts shared yet — they see nothing from your banks.</Text>
            )}
            <View className="mt-3">
              <Button variant="secondary" onPress={() => router.push("/family/connect")}>
                Choose accounts
              </Button>
            </View>
          </Section>

          <Section label="What they never see" footer="Nor can they move money, block purchases or change anything at your bank.">
            <Text className="text-footnote text-chalk-soft">
              Your bank password · balances and credit limits · full account numbers · accounts you haven't shared · what you record by hand in Flow.
            </Text>
          </Section>

          <Section label="Alerts and limits about you">
            {(about.data?.rules ?? []).filter((r) => r.enabled).length === 0 && (about.data?.budgets ?? []).length === 0 ? (
              <Text className="text-footnote text-chalk-mute">None set.</Text>
            ) : (
              <Group>
                {(about.data?.rules ?? [])
                  .filter((r) => r.enabled)
                  .map((r) => (
                    <GroupRow
                      key={`${r.guardian_id}-${r.kind}`}
                      title={ALERT_RULE_LABEL[r.kind]}
                      sub={`${names.get(r.guardian_id) ?? "Guardian"}${r.kind === "large_purchase" && r.threshold ? ` · from ${formatMoney(r.threshold, r.currency ?? "BRL")}` : ""}${r.categories?.length ? ` · ${r.categories.join(", ")}` : ""}`}
                    />
                  ))}
                {(about.data?.budgets ?? []).map((b) => (
                  <GroupRow
                    key={`${b.guardian_id}-${b.category}`}
                    title={`Monthly limit: ${b.category === "total" ? "all spending" : b.category}`}
                    sub={`${formatMoney(b.limit, b.currency ?? "BRL")} · ${names.get(b.guardian_id) ?? "Guardian"} · to follow, not a block`}
                  />
                ))}
              </Group>
            )}
          </Section>
        </>
      ) : null}

      <Section label="Access history" footer="Each time someone opens your spending it's recorded here. Repeated views within 30 minutes count once.">
        {activity.loading ? (
          <Loading />
        ) : aboutMe.length === 0 ? (
          <Text className="text-footnote text-chalk-mute">Nothing recorded yet.</Text>
        ) : (
          <Group>
            {aboutMe.slice(0, 60).map((a) => (
              <GroupRow key={a.id} title={describeActivity(a.action, a.actor_name, a.actor_id === userId)} sub={timeFmt.format(new Date(a.created_at))} />
            ))}
          </Group>
        )}
      </Section>

      <Section label="Your data" footer="A file with everything Flow Family holds about you: memberships, consents (when and from where), banks, accounts, entries and this history.">
        <Button variant="secondary" fullWidth disabled={exporting} onPress={() => void download()}>
          {exporting ? "Preparing…" : "Download my data"}
        </Button>
      </Section>
    </FamilyScroll>
  );
}

function FamilySharing({ family: f, onChanged, setError }: { family: DependentView; onChanged: () => void; setError: (m: string | null) => void }) {
  const c = f.consent;
  const active = c?.status === "active";
  const guardians = f.guardians.map((g) => g.display_name).join(", ");
  const [months, setMonths] = useState<number>(c?.months ?? 12);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const canRenew = !active && f.can_self_consent && c?.end_reason !== "removed_by_guardian";

  const stop = () =>
    Alert.alert(`Stop sharing with ${guardians}?`, "They lose access right now, and the alerts they had about you are deleted. You can share again later.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Stop sharing",
        style: "destructive",
        onPress: async () => {
          setError(null);
          try {
            await familyApi.revokeConsent(f.family.id);
            hapticSuccess();
            onChanged();
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);

  const leave = () =>
    Alert.alert(`Leave "${f.family.name}"?`, "Sharing ends right away. To join again you'll need a new invitation.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          setError(null);
          try {
            await familyApi.leave(f.family.id);
            onChanged();
          } catch (e) {
            setError((e as Error).message);
          }
        },
      },
    ]);

  const renew = async () => {
    setBusy(true);
    setError(null);
    try {
      await familyApi.renewConsent(f.family.id, CONSENT_TERM_VERSION, months, adult);
      hapticSuccess();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section label={`Who can see · ${f.family.name}`}>
      <Group>
        {f.guardians.map((g) => (
          <GroupRow key={g.user_id} title={g.display_name} sub={g.email ? `${g.email} · guardian` : "Guardian"} trailing={<Badge tone={active ? "ok" : "warn"}>{active ? "Can see" : "No access"}</Badge>} />
        ))}
      </Group>
      {active ? (
        <Text className="mt-2 px-4 text-caption text-chalk-mute">
          Since {dateFmt.format(new Date(c!.granted_at))}, until {dateFmt.format(new Date(c!.expires_at))}
          {c!.given_by === "legal_representative" ? " · consented by your legal representative" : ""}.
        </Text>
      ) : c?.end_reason ? (
        <Notice tone="warn" title="Not sharing">
          {END_REASON[c.end_reason] ?? "Sharing ended"}
          {c.ended_at ? ` on ${dateFmt.format(new Date(c.ended_at))}` : ""}.
        </Notice>
      ) : null}

      {canRenew ? (
        <View className="mt-4">
          <Text className="text-footnote text-chalk">Share again with {guardians}, under the current terms ({CONSENT_TERM_VERSION}):</Text>
          <View className="mt-3">
            <Choices label="For how long" value={months} onChange={setMonths} options={CONSENT_DURATIONS.map((m) => ({ value: m, label: `${m} months` }))} />
          </View>
          <Check checked={adult} onChange={setAdult}>
            I'm 18 or older and I'm agreeing for myself.
          </Check>
          <View className="mt-3">
            <Button variant="primary" disabled={!adult || busy} onPress={() => void renew()}>
              {busy ? "Saving…" : "Share again"}
            </Button>
          </View>
        </View>
      ) : null}

      <View className="mt-4 gap-3">
        {active ? (
          <Button variant="primary" fullWidth onPress={stop}>
            Stop sharing
          </Button>
        ) : null}
        <Button variant="secondary" fullWidth onPress={leave}>
          Leave family
        </Button>
      </View>
    </Section>
  );
}
