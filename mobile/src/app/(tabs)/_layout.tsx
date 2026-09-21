import { Tabs } from "expo-router";
import { BarChartIcon, GearIcon, HomeIcon, ReceiptIcon, RepeatIcon } from "~/components/icons";
import { RemindersProvider } from "~/features/reminders";

// From the shared design tokens: chalk for the active tab, chalk-faint for the
// rest, hairline `line` border on top of a white bar.
const ACTIVE = "#0A0A0A";
const INACTIVE = "#AEAEB4";

export default function TabsLayout() {
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
