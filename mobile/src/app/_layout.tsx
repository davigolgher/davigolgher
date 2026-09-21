// Order matters: polyfills before anything that reads browser globals, and the
// URL shim before @supabase/supabase-js loads.
import "react-native-url-polyfill/auto";
import "~/lib/polyfills";
import "../global.css";

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/features/auth/AuthProvider";
import { StoreProvider } from "@/data/store";
import { loadActivity, recordActivityToday } from "~/lib/activity";
import { SignInScreen } from "~/features/SignInScreen";
import { PaywallScreen } from "~/features/PaywallScreen";
import { OnboardingScreen } from "~/features/OnboardingScreen";
import { TutorialOverlay } from "~/features/TutorialOverlay";
import { useEntitlement } from "~/features/useEntitlement";
import { useFlowFlags } from "~/lib/flow";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Hydrate the streak log before the first render so the UI never flashes a
      // zero streak, then count this launch as activity.
      await loadActivity();
      recordActivityToday();
      if (!alive) return;
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {/* AuthProvider and StoreProvider are the web app's, imported unchanged —
          they are pure React, and the platform differences live below them in
          client.native.ts / auth.native.ts. */}
      <AuthProvider>
        <StoreProvider simulateLoading={false}>
          <Gate />
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
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
 * The first run, in order: sign in → what the app is for → the paywall → the
 * app, with the tour over it once.
 *
 * The intro comes before the paywall deliberately. Asking someone to subscribe
 * to something they haven't been shown is a worse trade than two screens.
 */
function Gate() {
  const auth = useAuth();
  const entitlement = useEntitlement();
  const { flags, mark } = useFlowFlags();
  // Set when a purchase succeeds, or when a dev build skips past the paywall.
  // Keeps the app open while the entitlement re-reads in the background.
  const [unlocked, setUnlocked] = useState(false);

  if (auth.configured && auth.loading) return <Splash />;
  if (auth.configured && !auth.session) return <SignInScreen />;
  // Wait for both rather than flashing a screen that's about to be replaced.
  if (auth.configured && (entitlement.loading || flags === null)) return <Splash />;

  if (auth.configured && flags && !flags.onboardingDone) {
    return <OnboardingScreen onDone={() => mark({ onboardingDone: true })} />;
  }

  if (auth.configured && !entitlement.entitled && !unlocked) {
    return (
      <PaywallScreen
        canSkip={entitlement.canSkip}
        onUnlocked={() => {
          setUnlocked(true);
          entitlement.refresh();
        }}
      />
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-expense" options={{ presentation: "modal" }} />
        <Stack.Screen name="add-subscription" options={{ presentation: "modal" }} />
        <Stack.Screen name="legal" options={{ presentation: "modal" }} />
      </Stack>

      {flags && !flags.tutorialDone ? <TutorialOverlay onDone={() => mark({ tutorialDone: true })} /> : null}
    </>
  );
}
