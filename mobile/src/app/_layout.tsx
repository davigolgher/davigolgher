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

/** Signed out → sign-in. Signed in → the tab navigator. */
function Gate() {
  const auth = useAuth();

  if (auth.configured && auth.loading) return <Splash />;
  if (auth.configured && !auth.session) return <SignInScreen />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-expense" options={{ presentation: "modal" }} />
      <Stack.Screen name="legal" options={{ presentation: "modal" }} />
    </Stack>
  );
}
