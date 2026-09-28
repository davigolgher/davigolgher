/**
 * Settings: budget, currency, categories, password, the legal documents,
 * subscription management, and account deletion.
 */
import { useRef, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { MIN_PASSWORD_LENGTH, changePassword, signOut } from "@/lib/backend/auth";
import { toCents, toMain } from "@/lib/money";
import { CURRENCIES, currencyByCode } from "@/data/currencies";
import { LEGAL_TITLES, type LegalDocId } from "@/features/legal/content";
import { LEAD_DAY_CHOICES } from "@/lib/reminders";
import { APP } from "@/config/app";
import { useFlowFlags } from "~/lib/flow";
import { forgetReminderPrefs, sendTestReminder } from "~/lib/notifications";
import { useRenewalReminders } from "~/features/reminders";
import { Button, Eyebrow, Input, ScreenHeader } from "~/components/ui";
import { CheckIcon, ChevronRightIcon } from "~/components/icons";

const LEGAL_ORDER: LegalDocId[] = ["terms", "privacy", "ai", "nutrition"];

const LEAD_LABEL: Record<number, string> = { 1: "1 day", 2: "2 days", 3: "3 days", 7: "A week" };

// The app's switch is monochrome like everything else; the platform default is
// iOS green.
const SWITCH_TRACK = { false: "#E5E5E7", true: "#0A0A0A" };

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-8">
      <Eyebrow>{label}</Eyebrow>
      <View className="mt-2">{children}</View>
    </View>
  );
}

function Row({ title, sub, onPress }: { title: string; sub?: string; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-line-soft py-3.5 active:opacity-60"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] text-chalk">{title}</Text>
        {sub ? <Text className="mt-0.5 text-[13px] text-chalk-mute">{sub}</Text> : null}
      </View>
      {onPress ? <ChevronRightIcon size={18} color="#8A8A8F" /> : null}
    </Pressable>
  );
}

export default function Settings() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { data, setMonthlyBudget, setCurrency, addCategory, removeCategory, deleteAccount } = useStore();
  const money = useMoney();

  const budget = data.budgets.find((b) => b.scope === "total")?.limit ?? 0;
  const [budgetText, setBudgetText] = useState(budget > 0 ? String(toMain(budget)) : "");
  const [newCategory, setNewCategory] = useState("");
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const { reset: resetFlowFlags } = useFlowFlags();
  const replayIntro = () =>
    Alert.alert("Show the intro again?", "You'll see the walkthrough, the plans and the tour, then come back here.", [
      { text: "Cancel", style: "cancel" },
      { text: "Show it", onPress: () => void resetFlowFlags() },
    ]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const reminders = useRenewalReminders();

  const toggleReminders = async (on: boolean) => {
    const ok = await reminders.setEnabled(on);
    if (on && !ok) {
      // iOS only ever shows its prompt once, so from here the only way to allow
      // them is the Settings app. Saying so beats a switch that won't stay on.
      Alert.alert(
        "Notifications are off",
        `iOS is blocking notifications for ${APP.name}. Turn them on in Settings → Notifications → ${APP.name}, then come back.`,
        [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings().catch(() => {}) },
        ],
      );
    }
  };

  const testReminder = async () => {
    if (await sendTestReminder()) {
      Alert.alert("On its way", "It arrives in about five seconds. Leave the app to see the banner.");
    } else {
      Alert.alert("Couldn't send it", "Check that notifications are allowed in iOS Settings.");
    }
  };

  const reminderStatus = () => {
    if (!reminders.prefs) return " ";
    if (!reminders.prefs.enabled) return "Off — nothing is scheduled.";
    if (!reminders.allowed) return "Allowed in the app, blocked by iOS. Check Settings → Notifications.";
    if (reminders.scheduled === null) return "Scheduling…";
    if (reminders.scheduled === 0) return "Nothing due yet — add a subscription and it'll appear here.";
    return `${reminders.scheduled} reminder${reminders.scheduled === 1 ? "" : "s"} scheduled.`;
  };

  const savePassword = async () => {
    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      Alert.alert("Password changed", "Use the new one the next time you sign in.");
    } catch (e) {
      Alert.alert("Couldn't save", (e as Error)?.message || "Try again.");
    } finally {
      setSavingPassword(false);
    }
  };

  const saveBudget = () => {
    const n = Number(budgetText.replace(/[^\d.]/g, ""));
    setMonthlyBudget(toCents(Number.isFinite(n) && n > 0 ? n : 0));
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "Your data stays in your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  /**
   * Deleting the account takes the password, typed here and checked by the
   * delete-account function before anything is erased. A session alone was
   * enough before, so an unlocked phone or a copied token could wipe years of
   * records beyond recovery (MASVS-AUTH-3: sensitive operations need more
   * than an existing session).
   *
   * One deletion at a time: `deleteHeld` is set before the request, since a
   * double tap otherwise sent a second request after the account was gone,
   * which the function rightly refused — and the app then reported a failed
   * deletion that had in fact worked.
   */
  const deleteHeld = useRef(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const closeDelete = () => {
    setDeleteOpen(false);
    setDeletePassword("");
  };

  const confirmDelete = async () => {
    if (deleteHeld.current || !deletePassword) return;
    deleteHeld.current = true;
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
    } catch (e) {
      deleteHeld.current = false;
      setDeleting(false);
      // Say so rather than clearing the screen and looking deleted: the login
      // would still exist, and signing up again would reopen it.
      Alert.alert("Couldn't delete the account", (e as Error)?.message || "Nothing was deleted. Try again.");
      return;
    }
    // Deliberately not released: the account is gone, and nothing left on
    // this screen should be able to start another deletion before signing out
    // unmounts it.
    //
    // The streak's days went with the account (they cascade from it on the
    // server). What's kept on this phone for the account — the first-run
    // flags, the reminder settings — goes here rather than being left behind.
    await resetFlowFlags();
    if (auth.userId) await forgetReminderPrefs(auth.userId);
    await signOut();
  };

  const confirmRemoveCategory = (id: string, label: string) => {
    Alert.alert(`Remove "${label}"?`, "Transactions already using it keep their label.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeCategory(id) },
    ]);
  };

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 48, paddingHorizontal: 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader eyebrow="Account" title="Settings" />

      <View className="mt-6 rounded-card border border-line bg-ink-850 p-5">
        <Eyebrow>Signed in as</Eyebrow>
        <Text className="mt-1 text-[16px] font-medium text-chalk">{auth.email ?? "—"}</Text>
        <Text className="mt-3 text-[13px] leading-relaxed text-chalk-mute">
          {data.transactions.length} transaction{data.transactions.length === 1 ? "" : "s"} ·{" "}
          {data.subscriptions.length} subscription{data.subscriptions.length === 1 ? "" : "s"} synced to your account.
        </Text>
      </View>

      <Section label="Monthly budget">
        <View className="flex-row items-center gap-2">
          <Input
            value={budgetText}
            onChangeText={setBudgetText}
            onBlur={saveBudget}
            keyboardType="decimal-pad"
            placeholder="0"
            className="flex-1"
            leading={
              <Text className="text-[16px] text-chalk-mute">{currencyByCode(data.preferences.currency).symbol}</Text>
            }
          />
          <Button variant="primary" onPress={saveBudget}>
            Save
          </Button>
        </View>
        <Text className="mt-2 text-[12px] text-chalk-mute">
          {budget > 0 ? `Currently ${money.format(budget)} per month.` : "No budget set — the Home screen shows total spending instead."}
        </Text>
      </Section>

      <Section label="Currency">
        <Row
          title={data.preferences.currency}
          sub={CURRENCIES.find((c) => c.code === data.preferences.currency)?.label}
          onPress={() => setCurrencyOpen((v) => !v)}
        />
        {currencyOpen
          ? CURRENCIES.map((c) => {
              const on = c.code === data.preferences.currency;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    setCurrency(c.code);
                    setCurrencyOpen(false);
                  }}
                  className="flex-row items-center gap-3 border-b border-line-soft py-3 active:opacity-60"
                >
                  <Text className="w-10 text-[15px] font-semibold text-chalk">{c.symbol}</Text>
                  <Text className="min-w-0 flex-1 text-[15px] text-chalk">
                    {c.label} <Text className="text-chalk-mute">({c.code})</Text>
                  </Text>
                  {on ? <CheckIcon size={18} strokeWidth={2.2} /> : null}
                </Pressable>
              );
            })
          : null}
      </Section>

      <Section label="Categories">
        <View className="flex-row flex-wrap gap-2">
          {data.categories.map((c) => (
            <Pressable
              key={c.id}
              onLongPress={() => confirmRemoveCategory(c.id, c.label)}
              accessibilityRole="button"
              accessibilityLabel={`${c.label} category`}
              // Press-and-hold can't be found with VoiceOver; offer it as an action.
              accessibilityActions={[{ name: "remove", label: "Remove" }]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === "remove") confirmRemoveCategory(c.id, c.label);
              }}
              className="rounded-pill border border-line-strong bg-ink-800 px-3.5 py-2 active:opacity-70"
            >
              <Text className="text-[13px] text-chalk">{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="mt-2 text-[12px] text-chalk-mute">Press and hold a category to remove it.</Text>
        <View className="mt-3 flex-row items-center gap-2">
          <Input
            value={newCategory}
            onChangeText={setNewCategory}
            placeholder="New category"
            className="flex-1"
          />
          <Button
            variant="primary"
            disabled={!newCategory.trim()}
            onPress={() => {
              addCategory(newCategory);
              setNewCategory("");
            }}
          >
            Add
          </Button>
        </View>
      </Section>

      <Section label="Reminders">
        <View className="flex-row items-center gap-3 border-b border-line-soft py-3.5">
          <View className="min-w-0 flex-1">
            <Text className="text-[15px] text-chalk">Warn me before a charge</Text>
            <Text className="mt-0.5 text-[13px] text-chalk-mute">{reminderStatus()}</Text>
          </View>
          <Switch
            value={Boolean(reminders.prefs?.enabled)}
            onValueChange={toggleReminders}
            trackColor={SWITCH_TRACK}
            thumbColor="#FFFFFF"
            ios_backgroundColor={SWITCH_TRACK.false}
          />
        </View>

        {reminders.prefs?.enabled ? (
          <>
            <Text className="mt-3 text-[12px] text-chalk-mute">How much warning</Text>
            <View className="mt-2 flex-row flex-wrap gap-2">
              {LEAD_DAY_CHOICES.map((d) => {
                const on = d === reminders.prefs?.leadDays;
                return (
                  <Pressable
                    key={d}
                    onPress={() => reminders.setLeadDays(d)}
                    className={`rounded-pill border px-3.5 py-2 active:opacity-80 ${
                      on ? "border-chalk bg-chalk" : "border-line-strong bg-ink-850"
                    }`}
                  >
                    <Text className={`text-[13px] font-medium ${on ? "text-ink-950" : "text-chalk"}`}>
                      {LEAD_LABEL[d]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="mt-2 flex-row items-center gap-3 border-b border-line-soft py-3.5">
              <View className="min-w-0 flex-1">
                <Text className="text-[15px] text-chalk">Show amounts</Text>
                <Text className="mt-0.5 text-[13px] text-chalk-mute">
                  Off: the name only. Notifications can be read on the Lock Screen.
                </Text>
              </View>
              <Switch
                value={Boolean(reminders.prefs?.showAmounts)}
                onValueChange={reminders.setShowAmounts}
                trackColor={SWITCH_TRACK}
                thumbColor="#FFFFFF"
                ios_backgroundColor={SWITCH_TRACK.false}
              />
            </View>
            <Row title="Send a test reminder" sub="Arrives in about five seconds" onPress={testReminder} />
          </>
        ) : null}

        <Text className="mt-2 text-[12px] leading-relaxed text-chalk-mute">
          A notification before each subscription renews, including {APP.name} itself. Scheduled on this phone — no
          alerts are sent from a server, and turning the switch off cancels them.
        </Text>
      </Section>

      <Section label="Password">
        <View className="gap-2">
          <Input
            value={currentPassword}
            onChangeText={setCurrentPassword}
            placeholder="Current password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />
          <View className="flex-row items-center gap-2">
            <Input
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="newPassword"
              className="flex-1"
            />
            <Button
              variant="primary"
              disabled={!currentPassword || newPassword.length < MIN_PASSWORD_LENGTH || savingPassword}
              onPress={savePassword}
            >
              {savingPassword ? "Saving…" : "Save"}
            </Button>
          </View>
        </View>
        <Text className="mt-2 text-[12px] text-chalk-mute">
          Your current password, then a new one of at least {MIN_PASSWORD_LENGTH} characters.
        </Text>
      </Section>

      <Section label="Legal & privacy">
        {LEGAL_ORDER.map((id) => (
          <Row key={id} title={LEGAL_TITLES[id]} onPress={() => router.push(`/legal?doc=${id}`)} />
        ))}
      </Section>

      <Section label="Subscription">
        <Row
          title="Manage subscription"
          sub="Opens the App Store, where you can change plan or cancel"
          onPress={() => Linking.openURL("https://apps.apple.com/account/subscriptions").catch(() => {})}
        />
        <Text className="mt-2 text-[12px] leading-relaxed text-chalk-mute">
          Purchases go through your Apple ID, so cancelling happens there — the same few taps as subscribing. Access
          continues until the end of the period you already paid for.
        </Text>
      </Section>

      <Section label="Help">
        <Row title="Show the intro again" sub="Replays the walkthrough and the tour" onPress={replayIntro} />
        <Row
          title="Contact support"
          sub={APP.supportEmail}
          onPress={() => Linking.openURL(`mailto:${APP.supportEmail}`).catch(() => {})}
        />
        <Text className="mt-2 text-[12px] leading-relaxed text-chalk-mute">
          Your data is stored with Supabase, our database provider, and scoped to your account. The Privacy Policy above
          has the details.
        </Text>
      </Section>

      <Section label="Account">
        <View className="gap-3">
          <Button variant="secondary" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
          {deleteOpen ? (
            <View className="rounded-card border border-line bg-ink-850 p-5">
              <Text className="text-[15px] font-semibold text-chalk">Delete your account?</Text>
              <Text className="mt-2 text-[13px] leading-relaxed text-chalk-mute">
                This erases your expenses, subscriptions, budgets and categories, and closes the account itself. It
                cannot be undone.
              </Text>
              <Text className="mt-2 text-[13px] leading-relaxed text-chalk-mute">
                If you subscribed through the App Store, cancel that first in iOS Settings → your name → Subscriptions,
                or you&apos;ll keep being charged.
              </Text>
              <Input
                value={deletePassword}
                onChangeText={setDeletePassword}
                placeholder="Your password"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                editable={!deleting}
                className="mt-4"
              />
              <View className="mt-3 flex-row gap-2">
                <View className="flex-1">
                  <Button variant="secondary" fullWidth disabled={deleting} onPress={closeDelete}>
                    Cancel
                  </Button>
                </View>
                <View className="flex-1">
                  <Button variant="primary" fullWidth disabled={!deletePassword || deleting} onPress={confirmDelete}>
                    {deleting ? "Deleting…" : "Delete everything"}
                  </Button>
                </View>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setDeleteOpen(true)} className="items-center py-3 active:opacity-60">
              <Text className="text-[14px] font-semibold text-chalk-soft">Delete account</Text>
            </Pressable>
          )}
        </View>
      </Section>

      <Text className="mt-8 text-[12px] text-chalk-mute">
        {APP.name} v{APP.version}
      </Text>
    </ScrollView>
  );
}
