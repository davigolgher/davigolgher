import { useEffect } from "react";
import { AppState } from "react-native";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useStore } from "@/data/store";
import { RemindersProvider } from "~/features/reminders";

// The selected tab in chalk; the bar's material and the unselected colour are
// iOS's own, so it matches the system on every version: Liquid Glass on iOS 26,
// the blurred bar before it. Labels keep the app's 11pt semibold.
const ACTIVE = "#0A0A0A";
const LABEL = { fontSize: 11, fontWeight: "600" } as const;

/*
 * The app's own line icons (components/icons.tsx), drawn at 20pt as template
 * images so the tab bar tints them. SF Symbols can't be sized from here and
 * came out bigger and heavier than the rest of the app; these are the same
 * marks the app has always used, a little smaller.
 */
const ICON = {
  home: require("../../../assets/images/tabs/home.png"),
  expenses: require("../../../assets/images/tabs/receipt.png"),
  subs: require("../../../assets/images/tabs/repeat.png"),
  reports: require("../../../assets/images/tabs/chart.png"),
  settings: require("../../../assets/images/tabs/gear.png"),
};

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
          iOS 26 glass for free, and looks like every other app on the phone.
          Each screen's first ScrollView has its insets adjusted for the status
          bar and the tab bar (see lib/screen). */}
      <NativeTabs tintColor={ACTIVE} labelStyle={LABEL}>
        <NativeTabs.Trigger name="index" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICON.home} renderingMode="template" md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="expenses" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Expenses</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICON.expenses} renderingMode="template" md="receipt_long" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="subs" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Subs</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICON.subs} renderingMode="template" md="autorenew" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="reports" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICON.reports} renderingMode="template" md="bar_chart" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" contentStyle={{ backgroundColor: "#FFFFFF" }}>
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon src={ICON.settings} renderingMode="template" md="settings" />
        </NativeTabs.Trigger>
      </NativeTabs>
    </RemindersProvider>
  );
}
