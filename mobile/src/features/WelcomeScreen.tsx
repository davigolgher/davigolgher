/**
 * The first screen. Says in one line what Flow gets you, then offers three
 * ways forward, the quickest to value first among equals:
 *   · Get started — create an account;
 *   · Explore with sample data — the whole app, filled in, no account;
 *   · I already have an account.
 */
import { useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "~/components/ui";
import { Point } from "~/components/kit";
import { LogoMark } from "~/components/Logo";
import { BarChartIcon, RepeatIcon, WalletIcon } from "~/components/icons";
import { BANKS_ENABLED } from "~/features/bank/flag";
import { useSampleMode } from "~/features/sample/SampleMode";
import { track } from "~/lib/analytics";
import { colors, iconSize } from "~/theme/tokens";

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { start, setEntry } = useSampleMode();
  useEffect(() => track("welcome_viewed"), []);

  return (
    <View className="flex-1 bg-ink-950">
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingHorizontal: 24, paddingTop: insets.top + 24, paddingBottom: 24 }}
      >
        <LogoMark size={48} />
        <Text className="mt-8 text-[32px] font-bold leading-tight tracking-tight text-chalk" accessibilityRole="header">
          See where your money goes.
        </Text>
        <Text className="mt-3 text-body text-chalk-mute">
          {BANKS_ENABLED
            ? "Connect your bank or log a purchase in seconds. Flow turns it into a month you can read at a glance."
            : "Log a purchase in seconds. Flow turns it into a month you can read at a glance."}
        </Text>
        <View className="mt-8 gap-5">
          <Point icon={<BarChartIcon size={iconSize.lg} color={colors.chalk.DEFAULT} />} title="Your month, clear">
            What's left to spend, where it went, and how it compares with last month.
          </Point>
          <Point icon={<RepeatIcon size={iconSize.lg} color={colors.chalk.DEFAULT} />} title="Every subscription in one place">
            {BANKS_ENABLED ? "Including the ones Flow finds in your spending." : "With a heads-up before each charge."}
          </Point>
          <Point icon={<WalletIcon size={iconSize.lg} color={colors.chalk.DEFAULT} />} title="Private by design">
            No ads, no selling data. Your bank password never reaches Flow.
          </Point>
        </View>
      </ScrollView>
      <View className="gap-3 px-6" style={{ paddingBottom: insets.bottom + 16 }}>
        <Button variant="primary" size="lg" fullWidth onPress={() => setEntry("signUp")}>
          Get started
        </Button>
        <Button variant="secondary" size="lg" fullWidth onPress={start}>
          Explore with sample data
        </Button>
        <Button variant="ghost" fullWidth onPress={() => setEntry("signIn")}>
          I already have an account
        </Button>
      </View>
    </View>
  );
}
