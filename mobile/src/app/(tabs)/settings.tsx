/**
 * Settings: budget, currency, categories, password, the legal documents,
 * subscription management, and account deletion.
 */
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { useStore } from "@/data/store";
import { useMoney } from "@/lib/useMoney";
import { MIN_PASSWORD_LENGTH, signOut, updatePassword } from "@/lib/backend/auth";
import { toCents, toMain } from "@/lib/money";
import { CURRENCIES, currencyByCode } from "@/data/currencies";
import { LEGAL_TITLES, type LegalDocId } from "@/features/legal/content";
import { APP } from "@/config/app";
import { clearActivity } from "~/lib/activity";
import { useFlowFlags } from "~/lib/flow";
import { Button, Eyebrow, Input, ScreenHeader } from "~/components/ui";
import { CheckIcon, ChevronRightIcon } from "~/components/icons";

const LEGAL_ORDER: LegalDocId[] = ["terms", "privacy", "ai", "nutrition"];

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
      {onPress ? <ChevronRightIcon size={18} color="#AEAEB4" /> : null}
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
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const savePassword = async () => {
    setSavingPassword(true);
    try {
      await updatePassword(newPassword);
      setNewPassword("");
      Alert.alert("Password saved", "You can now sign in with your email and this password.");
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

  const confirmDelete = () => {
    Alert.alert(
      "Delete your account?",
      "This erases your expenses, subscriptions, budgets and uploaded receipts. It cannot be undone.\n\nIf you subscribed through the App Store, cancel that first in iOS Settings → your name → Subscriptions, or you'll keep being charged.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete everything",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
            } catch (e) {
              // Say so rather than clearing the screen and looking deleted: the
              // login would still exist, and signing up again would reopen it.
              Alert.alert(
                "Couldn't delete the account",
                (e as Error)?.message ||
                  "Nothing was deleted. Check that the delete-account function is deployed, then try again.",
              );
              return;
            }
            // The streak log and the first-run flags live outside the store,
            // in AsyncStorage, so the next account starts from the beginning.
            await clearActivity();
            await resetFlowFlags();
            await signOut();
          },
        },
      ],
    );
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
        <Text className="mt-2 text-[12px] text-chalk-faint">
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
              className="rounded-pill border border-line-strong bg-ink-800 px-3.5 py-2 active:opacity-70"
            >
              <Text className="text-[13px] text-chalk">{c.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="mt-2 text-[12px] text-chalk-faint">Press and hold a category to remove it.</Text>
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

      <Section label="Password">
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
          <Button variant="primary" disabled={newPassword.length < MIN_PASSWORD_LENGTH || savingPassword} onPress={savePassword}>
            {savingPassword ? "Saving…" : "Save"}
          </Button>
        </View>
        <Text className="mt-2 text-[12px] text-chalk-faint">
          At least {MIN_PASSWORD_LENGTH} characters. Set one here if your account was created before passwords, or to
          change the one you have.
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
        <Text className="mt-2 text-[12px] leading-relaxed text-chalk-faint">
          Purchases go through your Apple ID, so cancelling happens there — the same few taps as subscribing. Access
          continues until the end of the period you already paid for.
        </Text>
      </Section>

      <Section label="Help">
        <Row
          title="Contact support"
          sub={APP.supportEmail}
          onPress={() => Linking.openURL(`mailto:${APP.supportEmail}`).catch(() => {})}
        />
        <Text className="mt-2 text-[12px] leading-relaxed text-chalk-faint">
          Your data is stored with Supabase, our database provider, and scoped to your account. The Privacy Policy above
          has the details.
        </Text>
      </Section>

      <Section label="Account">
        <View className="gap-3">
          <Button variant="secondary" fullWidth onPress={confirmSignOut}>
            Sign out
          </Button>
          <Pressable onPress={confirmDelete} className="items-center py-3 active:opacity-60">
            <Text className="text-[14px] font-semibold text-chalk-soft">Delete account</Text>
          </Pressable>
        </View>
      </Section>

      <Text className="mt-8 text-[12px] text-chalk-faint">
        {APP.name} v{APP.version}
      </Text>
    </ScrollView>
  );
}
