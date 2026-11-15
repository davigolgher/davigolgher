/**
 * The guardian's housekeeping: the family's name, its members, invitations
 * still waiting, renewing for a child or a person under curatela, and deleting
 * the family.
 */
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { router } from "expo-router";
import { familyApi, type GuardianView } from "@/lib/backend/family";
import { CONSENT_TERM_VERSION } from "@/lib/family/consentTerm";
import { KIND_LABEL } from "@/lib/family/copy";
import { Button, Group, GroupRow, Input } from "~/components/ui";
import { useFamily } from "~/features/family/FamilyProvider";
import { Check, FamilyScroll, Loading, Notice, Section } from "~/features/family/ui";
import { hapticSuccess } from "~/lib/haptics";

const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export default function Manage() {
  const { state, refresh } = useFamily();
  const g = state?.guardian_of;
  const [name, setName] = useState(g?.family.name ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!g) return <Loading />;

  const run = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      hapticSuccess();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const confirm = (title: string, body: string, action: string, work: () => Promise<unknown>) =>
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: action, style: "destructive", onPress: () => void run(work) },
    ]);

  return (
    <FamilyScroll>
      {error ? <Notice tone="alert">{error}</Notice> : null}

      <Section label="Family name">
        <View className="flex-row items-center gap-2">
          <Input value={name} onChangeText={setName} maxLength={60} className="flex-1" accessibilityLabel="Family name" />
          <Button variant="primary" disabled={!name.trim() || name.trim() === g.family.name} onPress={() => void run(() => familyApi.rename(g.family.id, name.trim()))}>
            Save
          </Button>
        </View>
      </Section>

      <Section label="People sharing with you" footer="Removing someone ends their sharing immediately. They keep their own account and data.">
        {g.dependents.length === 0 ? (
          <Text className="text-footnote text-chalk-mute">Nobody yet.</Text>
        ) : (
          <Group>
            {g.dependents.map((d) => (
              <GroupRow
                key={d.user_id}
                title={d.display_name}
                sub={`${KIND_LABEL[d.kind]} · ${d.consent?.status === "active" ? `until ${dateFmt.format(new Date(d.consent.expires_at))}` : "not sharing"} · tap to remove`}
                onPress={() =>
                  confirm(`Remove ${d.display_name}?`, "Their sharing ends now and you stop seeing their spending.", "Remove", () =>
                    familyApi.removeMember(g.family.id, d.user_id),
                  )
                }
              />
            ))}
          </Group>
        )}
      </Section>

      <Renewals g={g} onDone={() => void refresh()} setError={setError} />

      <Section label="Invitations waiting" footer="Codes last 7 days and work once.">
        {g.invites.length === 0 ? (
          <Text className="text-footnote text-chalk-mute">None.</Text>
        ) : (
          <Group>
            {g.invites.map((i) => (
              <GroupRow
                key={i.id}
                title={i.label}
                sub={`${KIND_LABEL[i.kind]} · until ${dateFmt.format(new Date(i.expires_at))} · tap to cancel`}
                onPress={() => confirm(`Cancel the invitation for ${i.label}?`, "The code stops working.", "Cancel invitation", () => familyApi.revokeInvite(i.id))}
              />
            ))}
          </Group>
        )}
      </Section>

      <Section label="Plan" footer="The plan is the guardian's Flow subscription. If it ends, nothing is deleted: you see one person and one account until it's back.">
        <Text className="text-body text-chalk">{g.plan === "paid" ? "Flow subscription — unlimited people and accounts, all alerts, PDF report" : "Free — one person, one account, purchase and connection alerts"}</Text>
      </Section>

      {/* The guardian is the family's creator: a family has one. */}
      {g ? (
        <Section label="Delete family" footer="Everyone stops sharing with you, and the family's budgets, alerts and invitations are deleted. People's own accounts and banks stay theirs.">
          <Button
            variant="secondary"
            fullWidth
            onPress={() =>
              confirm(`Delete "${g.family.name}"?`, "This ends all sharing in the family and can't be undone.", "Delete family", async () => {
                await familyApi.deleteFamily(g.family.id);
                router.dismissAll();
              })
            }
          >
            Delete family
          </Button>
        </Section>
      ) : null}
    </FamilyScroll>
  );
}

/** A minor's or ward's sharing that ended can be renewed by the representative (within 30 days of ending by date). */
function Renewals({ g, onDone, setError }: { g: GuardianView; onDone: () => void; setError: (m: string | null) => void }) {
  const due = g.dependents.filter((d) => d.kind !== "adult" && d.consent && d.consent.status !== "active" && d.consent.end_reason === "expired");
  const [declared, setDeclared] = useState(false);
  if (due.length === 0) return null;
  return (
    <Section label="Renew as their representative">
      <Text className="text-footnote text-chalk-soft">
        These people's sharing period ended. As their parent or legal representative you can renew it under the current terms
        ({CONSENT_TERM_VERSION}). They'll see it on their Sharing screen and can stop it.
      </Text>
      <Check checked={declared} onChange={setDeclared}>
        I'm their parent or legal representative and I consent to renew, in their best interest.
      </Check>
      <View className="mt-3 gap-2">
        {due.map((d) => (
          <Button
            key={d.user_id}
            variant="primary"
            fullWidth
            disabled={!declared}
            onPress={async () => {
              setError(null);
              try {
                await familyApi.renewAsRepresentative(g.family.id, d.user_id, CONSENT_TERM_VERSION, d.consent?.months ?? 12);
                onDone();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            {`Renew for ${d.display_name}`}
          </Button>
        ))}
      </View>
    </Section>
  );
}
