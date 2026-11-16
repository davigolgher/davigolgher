/**
 * Banks in Flow itself, in their own stack with a native header.
 *
 * A build without the flag leaves these files out (metro.config.js); a link
 * that lands here anyway is sent back to Home.
 */
import { Redirect, Stack } from "expo-router";
import { BANKS_ENABLED } from "~/features/bank/flag";
import { colors } from "~/theme/tokens";

export default function BanksLayout() {
  if (!BANKS_ENABLED) return <Redirect href="/" />;
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
      <Stack.Screen name="index" options={{ title: "Bank accounts" }} />
    </Stack>
  );
}
