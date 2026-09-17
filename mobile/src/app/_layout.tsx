// URL/Buffer shims that @supabase/supabase-js expects. Must load before it does.
import "react-native-url-polyfill/auto";
import "../global.css";

import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadActivity, recordActivityToday } from "~/lib/activity";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Hydrate the streak log before the first render so the UI never flashes
      // a zero streak, then count this launch as activity.
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
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FFFFFF" } }} />
    </SafeAreaProvider>
  );
}
