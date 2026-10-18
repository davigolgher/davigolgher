/**
 * Shown by a release build that was made without its settings.
 *
 * `EXPO_PUBLIC_*` values are baked in when the app is bundled. EAS builds in the
 * cloud from the repository, where `mobile/.env` doesn't exist (it's ignored on
 * purpose), so a build made without the variables set in EAS came out broken
 * in quiet ways: with no backend the app ran in its local demo mode (no
 * sign-in, every entry gone at the next launch); with no RevenueCat key the
 * paywall had nothing to sell and nobody could get in. This makes that build
 * say what's wrong on its first screen instead.
 */
import { Text, View } from "react-native";

export function MissingConfigScreen({ missing }: { missing: string[] }) {
  return (
    <View className="flex-1 justify-center bg-ink-950 px-8">
      <Text className="text-[22px] font-bold tracking-tight text-chalk">This build is missing its settings</Text>
      <Text className="mt-3 text-[15px] leading-relaxed text-chalk-soft">
        It was built without {missing.join(" and ")}. Set {missing.length === 1 ? "it" : "them"} for the build profile
        in EAS and build again — see mobile/README.md, “Building for TestFlight”.
      </Text>
    </View>
  );
}
