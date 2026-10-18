import { useEffect } from "react";
import { AppState } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useStore } from "@/data/store";
import { RemindersProvider } from "~/features/reminders";

// The selected tab in chalk. Everything else about the bar — its material,
// the unselected colour, the label font — is iOS's own, so it matches the
// system on every version: Liquid Glass on iOS 26, the blurred bar before it.
const ACTIVE = "#0A0A0A";

export default function TabsLayout() {
  const { sync, refresh, retrySync } = useStore();

  // Back in the app is the likeliest moment the connection is back too: send
  // what's waiting now rather than at the next scheduled retry, and have
  // another go at an account that failed to load.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      if (sync.loadFailed) refresh();
      else if (sync.pending > 0) retrySync();
    });
    return () => sub.remove();
  }, [sync.loadFailed, sync.pending, refresh, retrySync]);

  return (
    // Above every tab, so a subscription edited on any screen reschedules its
    // reminder on the way back, and Settings drives the same single instance.
    <RemindersProvider>
      {/* The system tab bar (UITabBarController), not one drawn in JavaScript:
          it gets the platform's material, tap-again-to-scroll-to-top and the
          iOS 26 glass for free, and looks like every other app on the phone. SF Symbols for the icons, filled when selected, the way
          Apple's apps do it. Each screen's first ScrollView has its insets
          adjusted for the status bar and the tab bar (see lib/screen). */}
      <NativeTabs tintColor={ACTIVE}>
        <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="expenses" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Expenses</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "receipt", selected: "receipt.fill" }} md="receipt_long" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="subs" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Subs</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf="repeat" md="autorenew" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="reports" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} md="bar_chart" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </RemindersProvider>
  );
}
