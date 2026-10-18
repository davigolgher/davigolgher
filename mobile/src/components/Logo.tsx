/**
 * Flow mark — a monochrome stack of cards (a wallet), drawn in a single colour.
 * Depth comes from opacity only, so it stays monochrome on any background: dark
 * on the light app surfaces, white on the black app icon.
 *
 * Same geometry as the web version this was ported from; keep them in step.
 */
import { Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";
import { APP } from "@/config/app";

export function LogoMark({ size = 28, color = "#0A0A0A" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {/* cards fanned back-to-front — depth via opacity keeps it monochrome */}
      <Rect x="8" y="5.5" width="16" height="7" rx="2.2" fill={color} opacity={0.3} />
      <Rect x="6" y="9" width="20" height="7" rx="2.6" fill={color} opacity={0.55} />
      {/* front card / wallet body */}
      <Rect x="4" y="12.5" width="24" height="13.5" rx="3.4" fill={color} />
    </Svg>
  );
}

export function Logo({ size = 24, color = "#0A0A0A" }: { size?: number; color?: string }) {
  return (
    <View className="flex-row items-center gap-2">
      <LogoMark size={size} color={color} />
      <Text style={{ fontSize: size * 0.82, letterSpacing: -0.5, color }} className="font-semibold">
        {APP.name}
      </Text>
    </View>
  );
}
