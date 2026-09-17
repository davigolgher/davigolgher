/**
 * Settings. Only what's wired so far — sign out and the account row. The full
 * screen (budget, currency, categories, Gmail, legal, delete account) is ported
 * next, alongside the other web screens.
 */
import { Alert, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/AuthProvider";
import { useStore } from "@/data/store";
import { signOut } from "@/lib/backend/auth";
import { APP } from "@/config/app";
import { Button, Eyebrow, ScreenHeader } from "~/components/ui";

export default function Settings() {
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const { data } = useStore();

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "Your data stays in your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <ScrollView
      className="flex-1 bg-ink-950"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: 24 }}
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

      <View className="mt-4">
        <Button variant="secondary" fullWidth onPress={confirmSignOut}>
          Sign out
        </Button>
      </View>

      <Text className="mt-8 text-[12px] text-chalk-faint">
        {APP.name} v{APP.version}
      </Text>
    </ScrollView>
  );
}
