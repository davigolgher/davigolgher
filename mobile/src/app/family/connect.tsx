/**
 * The dependent's banks, in any country a provider covers: connect one
 * through open banking, choose which accounts to share, reconnect one whose
 * consent ended, or disconnect.
 *
 * Accounts arrive unshared. Sharing one reads its last 90 days; stopping
 * deletes what was read from it. Disconnecting ends the connection at the
 * provider, which ends the consent given at the bank.
 */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { familyApi, type MyConnection } from "@/lib/backend/family";
import { CONNECTION_HINT, CONNECTION_LABEL } from "@/lib/family/copy";
import { Button, Group, GroupRow } from "~/components/ui";
import { BankConnectIntro, useBankConnect } from "~/features/family/BankConnect";
import { useFamily, useFamilyLive } from "~/features/family/FamilyProvider";
import { useFamilyQuery } from "~/features/family/useFamilyQuery";
import { Badge, Empty, Failed, FamilyScroll, Loading, Notice, SavedNotice, Section, SwitchRow } from "~/features/family/ui";
import { hapticSuccess } from "~/lib/haptics";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const KIND: Record<string, string> = { checking: "Account", savings: "Savings", credit_card: "Card" };
const ORPHAN_DAYS = 30;

export default function Connect() {
  useFamilyLive();
  const { state, isSharing } = useFamily();
  const q = useFamilyQuery("connections", familyApi.myConnections, { live: true });
  const [note, setNote] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const bank = useBankConnect((result) => {
    void q.reload();
    setAdding(false);
    if (result) {
      hapticSuccess();
      setNote(`Connected — ${result.accounts} account${result.accounts === 1 ? "" : "s"} found. Choose below what to share.`);
    }
  });

  const guardians = [...new Set((state?.dependent_of ?? []).filter((d) => d.consent?.status === "active").flatMap((d) => d.guardians.map((g) => g.display_name)))];
  const who = guardians.join(", ") || "your guardian";

  const toggle = async (conn: MyConnection, accountId: string, on: boolean) => {
    const apply = async () => {
      setBusyAccount(accountId);
      setActionError(null);
      try {
        await familyApi.setAccountShared(accountId, on);
        if (on) await familyApi.syncConnection({ connectionId: conn.id }).catch(() => null);
        await q.reload();
      } catch (e) {
        setActionError((e as Error).message);
      } finally {
        setBusyAccount(null);
      }
    };
    if (on) return apply();
    Alert.alert("Stop sharing this account?", `${who} stop seeing it, and what Flow read from it is deleted.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Stop sharing", style: "destructive", onPress: () => void apply() },
    ]);
  };

  const disconnect = (conn: MyConnection) =>
    Alert.alert(
      `Disconnect ${conn.institution_name || "this bank"}?`,
      "This ends the open banking connection with the bank and deletes everything Flow read through it.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: async () => {
            setActionError(null);
            try {
              await familyApi.disconnect(conn.id);
              await q.reload();
            } catch (e) {
              setActionError((e as Error).message);
            }
          },
        },
      ],
    );

  const refreshAll = async () => {
    for (const c of q.data ?? []) {
      if (c.status !== "expired" && !c.orphaned_at) await familyApi.syncConnection({ connectionId: c.id }).catch(() => null);
    }
    await q.reload();
  };

  if (q.loading) return <Loading />;
  if (!q.data && q.error) return <Failed message={q.error.message} onRetry={() => void q.reload()} />;
  const conns = q.data ?? [];

  return (
    <FamilyScroll onRefresh={() => void refreshAll()} refreshing={q.refreshing}>
      <SavedNotice savedAt={q.savedAt} />
      {bank.modal}
      {note ? <Notice tone="ok">{note}</Notice> : null}
      {bank.error ? <Notice tone="alert">{bank.error}</Notice> : null}
      {actionError ? <Notice tone="alert">{actionError}</Notice> : null}

      {!isSharing ? (
        <Notice tone="warn" title="You're not sharing with anyone">
          Join a family with an invitation code before connecting a bank.
        </Notice>
      ) : null}

      {conns.length === 0 ? (
        <Section>{isSharing ? <BankConnectIntro busy={bank.busy} onStart={(country) => void bank.start({ country })} /> : <Empty title="No banks connected" />}</Section>
      ) : null}

      {conns.map((c) => {
        const tone = c.status === "active" ? "ok" : c.status === "updating" ? "info" : "alert";
        const endsOn = c.orphaned_at ? new Date(new Date(c.orphaned_at).getTime() + ORPHAN_DAYS * 86_400_000) : null;
        return (
          <Section key={c.id} label={`${c.institution_name || "Bank"}${c.country_code ? ` · ${c.country_code}` : ""}`}>
            <View className="flex-row items-center gap-2">
              <Badge tone={tone}>{CONNECTION_LABEL[c.status]}</Badge>
              {c.last_synced_at ? <Text className="text-caption text-chalk-mute">Updated {dateFmt.format(new Date(c.last_synced_at))}</Text> : null}
            </View>
            {c.status !== "active" ? <Text className="mt-2 text-footnote text-chalk-mute">{CONNECTION_HINT[c.status]}</Text> : null}
            {endsOn ? (
              <Notice tone="warn" title="Not shared with anyone">
                You're no longer sharing with a family, so nothing new is read. This connection will be disconnected and its data
                deleted on {dateFmt.format(endsOn)} unless you share again.
              </Notice>
            ) : null}

            <View className="mt-3">
              <Group>
                {c.accounts.map((a) => (
                  <SwitchRow
                    key={a.id}
                    title={`${KIND[a.kind] ?? "Account"}${a.last4 ? ` •••• ${a.last4}` : ""}`}
                    sub={a.shared ? `Shared with ${who}` : a.name || "Not shared"}
                    value={a.shared}
                    disabled={busyAccount === a.id || Boolean(c.orphaned_at) || (!a.shared && !isSharing)}
                    onChange={(on) => void toggle(c, a.id, on)}
                  />
                ))}
                {c.status === "needs_attention" || c.status === "expired" || c.status === "error" ? (
                  <GroupRow
                    title="Reconnect"
                    sub="Sign in to the bank again through open banking"
                    onPress={() => void bank.start({ connectionId: c.id, provider: c.provider, itemId: c.external_item_id })}
                  />
                ) : null}
                <GroupRow title="Disconnect this bank" onPress={() => disconnect(c)} />
              </Group>
            </View>
            {c.consent_expires_at ? (
              <Text className="mt-2 px-4 text-caption text-chalk-mute">
                Your consent at the bank is valid until {dateFmt.format(new Date(c.consent_expires_at))}.
              </Text>
            ) : null}
          </Section>
        );
      })}

      {conns.length > 0 && isSharing ? (
        adding ? (
          <Section label="Another bank">
            <BankConnectIntro busy={bank.busy} onStart={(country) => void bank.start({ country })} />
          </Section>
        ) : (
          <View className="mt-8">
            <Button variant="secondary" fullWidth disabled={bank.busy} onPress={() => setAdding(true)}>
              Connect another bank
            </Button>
          </View>
        )
      ) : null}
    </FamilyScroll>
  );
}
