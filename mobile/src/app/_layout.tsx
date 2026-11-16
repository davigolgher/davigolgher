// Order matters: polyfills before anything that reads browser globals, and the
// URL shim before @supabase/supabase-js loads.
import "react-native-url-polyfill/auto";
import "~/lib/polyfills";
import "../global.css";

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { isSupabaseConfigured } from "@/lib/backend/client";
import { StoreProvider } from "@/data/store";
import { SignInScreen } from "~/features/SignInScreen";
import { PaywallScreen } from "~/features/PaywallScreen";
import { OnboardingScreen } from "~/features/OnboardingScreen";
import { TutorialOverlay } from "~/features/TutorialOverlay";
import { MissingConfigScreen } from "~/features/MissingConfigScreen";
import { PrivacyShield } from "~/components/PrivacyShield";
import { REVENUECAT_IOS_KEY } from "~/lib/purchases";
import { useEntitlement } from "~/features/useEntitlement";
import { useFlowFlags } from "~/lib/flow";
import { clearReminders } from "~/lib/notifications";
import { FAMILY_ENABLED } from "~/features/family/flag";
import { FamilyProvider } from "~/features/family/FamilyProvider";
import { WelcomeScreen } from "~/features/WelcomeScreen";
import { BANKS_ENABLED } from "~/features/bank/flag";
import { SampleModeProvider, useSampleMode } from "~/features/sample/SampleMode";
import { flush, startAnalytics, track } from "~/lib/analytics";

// The streak's days used to be one log for the whole phone. They're stored with
// each account now (see the `activity_days` table); the old log can't be told
// apart by account, so it's dropped rather than handed to whoever signs in next.
AsyncStorage.removeItem("flow.activity.v1").catch(() => {});

/** Build settings a release can't work without, by the name EAS knows them. */
const missingSettings = [
  ...(isSupabaseConfigured ? [] : ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"]),
  ...(REVENUECAT_IOS_KEY ? [] : ["EXPO_PUBLIC_REVENUECAT_IOS_KEY"]),
];

export default function RootLayout() {
  // Nothing to load before the first frame any more — the streak arrives with
  // the rest of the account's data, and the gate shows its own splash while
  // auth resolves.
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    startAnalytics();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* AuthProvider and StoreProvider are the web app's, imported unchanged —
          they are pure React, and the platform differences live below them in
          client.native.ts / auth.native.ts. */}
      <SampleModeProvider>
        <AuthProvider>
          <Store>
            <Gate />
          </Store>
        </AuthProvider>
      </SampleModeProvider>
      {/* Last, so it draws over everything — modals and the tour included. */}
      <PrivacyShield />
    </SafeAreaProvider>
  );
}

/** The store, holding the sample month while someone explores without an account. */
function Store({ children }: { children: React.JSX.Element }) {
  const { data } = useSampleMode();
  return (
    <StoreProvider simulateLoading={false} sample={data}>
      {children}
    </StoreProvider>
  );
}

function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-ink-950">
      <ActivityIndicator color="#0A0A0A" />
    </View>
  );
}

/**
 * The first run, in order: welcome (with the sample month one tap away) →
 * sign up → what you want from Flow → the paywall → the app, where Home's
 * next step leads to the first value (connect your bank, or a first expense).
 *
 * The sample comes before any form deliberately: seeing a filled-in Flow is
 * the fastest way to understand it (docs/produto/estrategia.md). The intro
 * still comes before the paywall: asking someone to subscribe to something
 * they haven't been shown is a worse trade than a screen.
 */
function Gate() {
  const auth = useAuth();
  const sample = useSampleMode();
  const entitlement = useEntitlement();
  const { flags, mark } = useFlowFlags();
  // Set when a purchase succeeds, or when a dev build skips past the paywall.
  // Keeps the app open while the entitlement re-reads in the background.
  const [unlocked, setUnlocked] = useState(false);

  // Asking to see the intro again means the whole first run, paywall included —
  // otherwise this session's earlier unlock would carry you straight past it.
  const replaying = flags !== null && !flags.onboardingDone;
  useEffect(() => {
    if (replaying) setUnlocked(false);
  }, [replaying]);

  // An unlock belongs to the account that earned it. The gate outlives a sign
  // out, so without this the next account on the phone inherited it.
  useEffect(() => {
    setUnlocked(false);
  }, [auth.userId]);

  // Reminders are scheduled with iOS and outlive the account that set them:
  // they kept arriving — name and amount — after signing out or deleting the
  // account. Clear them whenever the account on the phone changes, and on a
  // launch with nobody signed in (a session ended elsewhere, say).
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.configured || auth.loading) return;
    const previous = lastUser.current;
    lastUser.current = auth.userId;
    if (!auth.userId || (previous && previous !== auth.userId)) void clearReminders();
  }, [auth.configured, auth.loading, auth.userId]);

  // Events wait on the phone until there is an account to send them for.
  useEffect(() => {
    if (auth.userId) void flush();
  }, [auth.userId]);

  const paywallShown =
    auth.configured &&
    Boolean(auth.session) &&
    Boolean(flags?.onboardingDone) &&
    !(FAMILY_ENABLED && flags?.familyOnly) &&
    !entitlement.loading &&
    !entitlement.entitled &&
    !unlocked;
  useEffect(() => {
    if (paywallShown) track("paywall_viewed");
  }, [paywallShown]);

  // Local mode, with no backend, is for development only, and so is a paywall
  // with no store behind it. A release build in either state was built without
  // its settings and must not pass for working.
  if (!__DEV__ && missingSettings.length > 0) return <MissingConfigScreen missing={missingSettings} />;
  if (auth.configured && auth.loading) return <Splash />;
  if (auth.configured && !auth.session) {
    if (sample.data) return <AppStack familyOnly={false} tour={false} />;
    if (sample.entry === "welcome") return <WelcomeScreen />;
    return <SignInScreen key={sample.entry} initialMode={sample.entry} onBack={() => sample.setEntry("welcome")} />;
  }
  // Wait for the flags rather than flashing a screen that's about to be
  // replaced — it's one local read, so the wait is imperceptible.
  if (auth.configured && flags === null) return <Splash />;
  // Never once unlocked. Getting past the paywall re-checks the entitlement,
  // and treating that as "loading" put a blank screen over the app the user
  // had just been let into.
  if (auth.configured && entitlement.loading && !unlocked) return <Splash />;

  if (auth.configured && flags && !flags.onboardingDone) {
    return <OnboardingScreen onDone={(goals) => mark({ onboardingDone: true, goals })} />;
  }

  // Flow Family builds only: someone who chose, on the paywall, to use just
  // Flow Family without subscribing. They get the Family screens and nothing
  // else; the rest of Flow stays behind the paywall (see family/account).
  const familyOnly = FAMILY_ENABLED && Boolean(flags?.familyOnly) && !entitlement.entitled && !unlocked;

  if (auth.configured && !entitlement.entitled && !unlocked && !familyOnly) {
    return (
      <PaywallScreen
        canSkip={entitlement.canSkip}
        onUnlocked={() => {
          track("paywall_converted");
          setUnlocked(true);
          entitlement.refresh();
        }}
        onFamilyOnly={
          FAMILY_ENABLED
            ? () => {
                track("family_only_chosen");
                mark({ familyOnly: true });
              }
            : undefined
        }
      />
    );
  }

  return <AppStack familyOnly={familyOnly} tour={Boolean(flags && !flags.tutorialDone) && !familyOnly} onTourDone={() => mark({ tutorialDone: true })} />;
}

/** The app itself: tabs and the screens over them, for an account or the sample. */
function AppStack({ familyOnly, tour, onTourDone }: { familyOnly: boolean; tour: boolean; onTourDone?: () => void }) {
  const app = (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-expense" options={{ presentation: "modal" }} />
        <Stack.Screen name="add-subscription" options={{ presentation: "modal" }} />
        <Stack.Screen name="budget" options={{ presentation: "modal" }} />
        <Stack.Screen name="legal" options={{ presentation: "modal" }} />
        <Stack.Screen name="review" options={{ presentation: "modal" }} />
        <Stack.Screen name="streak" options={{ presentation: "modal" }} />
        {FAMILY_ENABLED ? <Stack.Screen name="family" /> : null}
        {BANKS_ENABLED ? <Stack.Screen name="banks" /> : null}
      </Stack>

      {/* Always mounted, shown by `visible` — see TutorialOverlay. The tour
          is of the tabs, which a Family-only account doesn't have. */}
      <TutorialOverlay visible={tour} onDone={() => onTourDone?.()} />
    </>
  );

  return FAMILY_ENABLED ? <FamilyProvider familyOnly={familyOnly}>{app}</FamilyProvider> : app;
}
