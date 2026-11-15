/**
 * Flow Family's screens, in their own stack with native headers.
 *
 * A build without the feature flag has these files but never shows them:
 * a link that lands here (flow://family/...) is sent back to Home.
 */
import { Redirect, Stack } from "expo-router";
import { FAMILY_ENABLED } from "~/features/family/flag";
import { colors } from "~/theme/tokens";

export default function FamilyLayout() {
  if (!FAMILY_ENABLED) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.ink[950] },
        headerTintColor: colors.chalk.DEFAULT,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.ink[950] },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Family" }} />
      <Stack.Screen name="create" options={{ title: "New family" }} />
      <Stack.Screen name="invite" options={{ title: "Invite" }} />
      <Stack.Screen name="join" options={{ title: "Join a family" }} />
      <Stack.Screen name="consent" options={{ title: "Sharing terms" }} />
      <Stack.Screen name="connect" options={{ title: "Bank accounts" }} />
      <Stack.Screen name="sharing" options={{ title: "What you share" }} />
      <Stack.Screen name="dependent/[id]" options={{ title: "" }} />
      <Stack.Screen name="budgets" options={{ title: "Budgets" }} />
      <Stack.Screen name="alerts" options={{ title: "Alerts" }} />
      <Stack.Screen name="manage" options={{ title: "Manage family" }} />
      <Stack.Screen name="account" options={{ title: "Account" }} />
    </Stack>
  );
}
