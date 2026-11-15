/**
 * Flow Family on the Home screen — only for someone already in a family.
 *
 * For a dependent it is the "monitoring is visible" promise: while they share
 * with anyone, Home always says with whom, and one tap shows exactly what and
 * stops it. It can't be dismissed. For a guardian it's the way in to their
 * dependents' spending.
 */
import { Text, View } from "react-native";
import { router } from "expo-router";
import { PressableScale, CARD_SURFACE } from "~/components/ui";
import { ChevronRightIcon } from "~/components/icons";
import { colors, iconSize } from "~/theme/tokens";
import { useFamily } from "./FamilyProvider";
import { EyeIcon, UsersIcon } from "./icons";

export function FamilyHomeCard() {
  const { enabled, state, isGuardian, isSharing } = useFamily();
  if (!enabled || !state) return null;

  const sharingWith = state.dependent_of
    .filter((d) => d.consent?.status === "active")
    .flatMap((d) => d.guardians.map((g) => g.display_name));

  const cards: React.ReactNode[] = [];

  if (isSharing) {
    const names = [...new Set(sharingWith)];
    const who = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
    cards.push(
      <PressableScale
        key="sharing"
        onPress={() => router.push("/family/sharing")}
        accessibilityRole="button"
        accessibilityLabel={`Your spending is shared with ${who}. Review or stop sharing.`}
        containerClassName="mt-4"
        className="flex-row items-center gap-3 rounded-card-sm bg-ink-800 p-4"
      >
        <EyeIcon size={iconSize.lg} />
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-chalk">Shared with {who}</Text>
          <Text className="mt-0.5 text-footnote text-chalk-mute">See what they can see, or stop sharing</Text>
        </View>
        <ChevronRightIcon size={iconSize.md} color={colors.chalk.faint} />
      </PressableScale>,
    );
  }

  if (isGuardian && state.guardian_of) {
    const n = state.guardian_of.dependents.length;
    cards.push(
      <PressableScale
        key="guardian"
        onPress={() => router.push("/family")}
        accessibilityRole="button"
        containerClassName="mt-4"
        className="flex-row items-center gap-3 rounded-card bg-ink-850 p-4"
        style={CARD_SURFACE}
      >
        <UsersIcon size={iconSize.lg} />
        <View className="min-w-0 flex-1">
          <Text className="text-subhead font-semibold text-chalk">{state.guardian_of.family.name}</Text>
          <Text className="mt-0.5 text-footnote text-chalk-mute">
            {n === 0 ? "Invite someone to start" : `${n} ${n === 1 ? "person" : "people"} sharing with you`}
          </Text>
        </View>
        <ChevronRightIcon size={iconSize.md} color={colors.chalk.faint} />
      </PressableScale>,
    );
  }

  return cards.length ? <>{cards}</> : null;
}
