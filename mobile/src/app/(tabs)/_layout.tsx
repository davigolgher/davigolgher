import { useEffect } from "react";
import { AppState } from "react-native";
import { Tabs } from "expo-router";
import { useStore } from "@/data/store";
import { BarChartIcon, GearIcon, HomeIcon, ReceiptIcon, RepeatIcon } from "~/components/icons";
import { RemindersProvider } from "~/features/reminders";

// From the shared design tokens: chalk for the active tab, chalk-mute for the
// rest (their labels are text, so they need the 4.5:1 that mute has), hairline
// `line` border on top of a white bar.
const ACTIVE = "#0A0A0A";
const INACTIVE = "#6E6E73";

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
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: ACTIVE,
          tabBarInactiveTintColor: INACTIVE,
          tabBarStyle: { backgroundColor: "#FFFFFF", borderTopColor: "rgba(0,0,0,0.10)" },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          sceneStyle: { backgroundColor: "#FFFFFF" },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Home", tabBarIcon: ({ color }) => <HomeIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="expenses"
          options={{ title: "Expenses", tabBarIcon: ({ color }) => <ReceiptIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="subs"
          options={{ title: "Subs", tabBarIcon: ({ color }) => <RepeatIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="reports"
          options={{ title: "Reports", tabBarIcon: ({ color }) => <BarChartIcon size={22} color={color} /> }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: "Settings", tabBarIcon: ({ color }) => <GearIcon size={22} color={color} /> }}
        />
      </Tabs>
    </RemindersProvider>
  );
}
