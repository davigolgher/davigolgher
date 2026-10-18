/**
 * The tour, shown once after the paywall.
 *
 * A sheet over the app rather than another full-screen flow: the point is to
 * name what's already behind it, and covering that up would defeat the
 * explanation.
 */
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { APP } from "@/config/app";
import { Button } from "~/components/ui";
import { BarChartIcon, PlusIcon, RepeatIcon, WalletIcon } from "~/components/icons";

const STEPS = [
  {
    icon: <WalletIcon size={22} />,
    title: "This is your month",
    body: "Total spent, your budget, and what's left — at a glance on Home.",
  },
  {
    icon: <PlusIcon size={22} strokeWidth={2.2} />,
    title: "Add an expense",
    body: "Tap Add, type an amount, pick a category. That's it.",
  },
  {
    icon: <BarChartIcon size={22} />,
    title: "See the breakdown",
    body: "Reports shows where your money goes, by category and by month.",
  },
  {
    icon: <RepeatIcon size={22} />,
    title: "Track subscriptions",
    body: "Add recurring charges so a renewal never takes you by surprise.",
  },
];

/**
 * Stays mounted and is driven by `visible`.
 *
 * Unmounting it on dismissal took the Modal away mid-animation, and iOS left
 * its window behind — invisible, on top, swallowing every touch. The app looked
 * frozen right after the tour: nothing scrolled and nothing tapped.
 *
 * The backdrop colour is a style rather than `bg-black/50` for the same reason
 * the Input's border is: NativeWind doesn't resolve the `/opacity` shorthand
 * here, and an unresolved backdrop is an invisible one.
 */
export function TutorialOverlay({ visible, onDone }: { visible: boolean; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Living longer than one showing means the step index does too; replaying the
  // tour would otherwise open on its last card.
  useEffect(() => {
    if (visible) setI(0);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View className="flex-1 justify-end" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View className="rounded-t-sheet border-t border-line bg-ink-950 px-6 pt-6" style={{ paddingBottom: insets.bottom + 20 }}>
          <View className="h-12 w-12 items-center justify-center rounded-[16px] border border-line bg-ink-800">
            {step.icon}
          </View>
          <Text className="mt-4 text-[20px] font-bold tracking-tight text-chalk">{step.title}</Text>
          <Text className="mt-2 text-[15px] leading-relaxed text-chalk-mute">{step.body}</Text>

          <View className="mt-5 flex-row items-center gap-1.5">
            {STEPS.map((s, idx) => (
              <View key={s.title} className={`h-1 flex-1 rounded-pill ${idx <= i ? "bg-chalk" : "bg-ink-700"}`} />
            ))}
          </View>

          <View className="mt-5 flex-row items-center justify-between gap-3">
            <Pressable onPress={onDone} className="py-2 active:opacity-60">
              <Text className="text-[13px] font-medium text-chalk-mute">Skip</Text>
            </Pressable>
            <Button variant="primary" onPress={() => (last ? onDone() : setI(i + 1))}>
              {last ? `Start using ${APP.name}` : "Next"}
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}
