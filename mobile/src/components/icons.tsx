/**
 * Line icons for the native app.
 *
 * Same paths, viewBox and stroke style as the web app's `src/components/icons`,
 * drawn with react-native-svg instead of DOM SVG, so both apps render the same
 * marks. Keep the two in sync when adding an icon.
 */
import type { ReactNode } from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";

export interface IconProps {
  size?: number;
  /**
   * Stroke colour, defaulting to the `chalk` ink from the design tokens.
   * Typed as ColorValue so it accepts what navigator props like
   * `tabBarIcon`'s `color` hand over.
   */
  color?: ColorValue;
  strokeWidth?: number;
}

function Icon({ size = 24, color = "#0A0A0A", strokeWidth = 1.6, children }: IconProps & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </G>
    </Svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" />
  </Icon>
);

export const ReceiptIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 3.5h12v17l-2.2-1.4-2.2 1.4-2.2-1.4-2.2 1.4L7 20.5 6 21z" />
    <Path d="M9 8h6M9 12h6" />
  </Icon>
);

export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 9a6 6 0 0 1 10.5-4M20 15A6 6 0 0 1 9.5 19" />
    <Path d="M15 4.5 15 8l3.4-.2M9 19.5 9 16l-3.4.2" />
  </Icon>
);

export const BarChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 20V10M12 20V4M19 20v-7" />
  </Icon>
);

export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="3" />
    <Path d="M12 2.5v3M12 18.5v3M4.2 7l2.6 1.5M17.2 15.5l2.6 1.5M4.2 17l2.6-1.5M17.2 8.5l2.6-1.5" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 5v14M5 12h14" />
  </Icon>
);

export const WalletIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 8a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v1" />
    <Rect x="4" y="7" width="16" height="12" rx="3" />
    <Path d="M20 12h-3.5a1.5 1.5 0 0 0 0 3H20" />
  </Icon>
);

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <Path d="m4 7 8 5.5L20 7" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 6l6 6-6 6" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12.5 10 17l9-10" />
  </Icon>
);
