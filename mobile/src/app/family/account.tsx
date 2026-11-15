/**
 * The account, for someone using only Flow Family (no Flow subscription):
 * everything Settings offers that applies to them — the legal documents, a
 * copy of their data, signing out, and deleting the account in the app
 * (App Store 5.1.1(v), Google Play's account deletion policy) — plus the way
 * to the rest of Flow.
 */
import { useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/features/auth/AuthProvider";
import { useStore } from "@/data/store";
import { LEGAL_TITLES, type LegalDocId } from "@/features/legal/content";
import { APP } from "@/config/app";
import { Button, Card, Group, GroupRow, Input } from "~/components/ui";
import { useFlowFlags } from "~/lib/flow";
import { forgetReminderPrefs } from "~/lib/notifications";
import { shareMyData } from "~/features/family/files";
import { signOutOfFamily, unregisterPush } from "~/features/family/push";
import { FamilyScroll, Notice, Section } from "~/features/family/ui";
import { clearAllCaches } from "~/features/family/cache";
import { signOut } from "@/lib/backend/auth";

const LEGAL: LegalDocId[] = ["terms", "privacy", "family"];

export default function FamilyAccount() {
  const auth = useAuth();
  const { deleteAccount } = useStore();
  const { mark, reset } = useFlowFlags();
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const held = useRef(false);

  const remove = async () => {
    if (held.current || !password) return;
    held.current = true;
    setDeleting(true);
    setError(null);
    try {
      await unregisterPush();
      // The function also ends the person's bank connections at the aggregator.
      await deleteAccount(password);
    } catch (e) {
      held.current = false;
      setDeleting(false);
      setError((e as Error)?.message || "Nothing was deleted. Try again.");
      return;
    }
    await clearAllCaches();
    await reset();
    if (auth.userId) await forgetReminderPrefs(auth.userId);
    await signOut();
  };

  return (
    <FamilyScroll>
      <Section label="Signed in as">
        <Text className="text-callout font-medium text-chalk">{auth.email ?? "—"}</Text>
      </Section>

      <Section label={`All of ${APP.name}`} footer={`Expenses, subscriptions, budgets and reports for your own money come with a ${APP.name} subscription. It also unlocks more people, more alerts and the PDF report in Flow Family.`}>
        <Button
          variant="primary"
          fullWidth
          onPress={() => {
            // Back through the paywall; Flow Family stays as it is.
            mark({ familyOnly: false });
            router.dismissAll();
          }}
        >
          {`See ${APP.name} plans`}
        </Button>
      </Section>

      <Section label="Your data" footer="Everything Flow Family holds about you, as a file.">
        <Button
          variant="secondary"
          fullWidth
          disabled={exporting}
          onPress={async () => {
            setExporting(true);
            setError(null);
            try {
              await shareMyData();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setExporting(false);
            }
          }}
        >
          {exporting ? "Preparing…" : "Download my data"}
        </Button>
      </Section>

      <Section label="Legal & privacy">
        <Group>
          {LEGAL.map((id) => (
            <GroupRow key={id} title={LEGAL_TITLES[id]} onPress={() => router.push(`/legal?doc=${id}`)} />
          ))}
          <GroupRow title="Contact support" sub={APP.supportEmail} onPress={() => Linking.openURL(`mailto:${APP.supportEmail}`).catch(() => {})} />
        </Group>
      </Section>

      {error ? <Notice tone="alert">{error}</Notice> : null}

      <Section label="Account">
        <View className="gap-3">
          <Button variant="secondary" fullWidth onPress={() => void signOutOfFamily()}>
            Sign out
          </Button>
          {deleteOpen ? (
            <Card>
              <Text className="text-body font-semibold text-chalk">Delete your account?</Text>
              <Text className="mt-2 text-footnote text-chalk-mute">
                This erases your account and everything in it: families you created, your sharing, your bank connections (they're
                also ended with the bank) and your history. It can't be undone.
              </Text>
              <Input
                value={password}
                onChangeText={setPassword}
                placeholder="Your password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                editable={!deleting}
                className="mt-4"
              />
              <View className="mt-3 gap-2">
                <Button variant="primary" fullWidth disabled={!password || deleting} onPress={() => void remove()}>
                  {deleting ? "Deleting…" : "Delete everything"}
                </Button>
                <Button variant="secondary" fullWidth disabled={deleting} onPress={() => { setDeleteOpen(false); setPassword(""); }}>
                  Cancel
                </Button>
              </View>
            </Card>
          ) : (
            <Button variant="ghost" fullWidth onPress={() => setDeleteOpen(true)}>
              Delete account
            </Button>
          )}
        </View>
      </Section>
    </FamilyScroll>
  );
}
