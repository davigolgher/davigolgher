/**
 * Flow Family's line icons: the same grid, stroke and caps as
 * components/icons.tsx, for the marks only this feature needs.
 */
import type { ReactNode } from "react";
import type { ColorValue } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";
import { colors, iconSize } from "~/theme/tokens";

interface Props {
  size?: number;
  color?: ColorValue;
  strokeWidth?: number;
}

function Icon({ size = iconSize.xl, color = colors.chalk.DEFAULT, strokeWidth = 1.6, children }: Props & { children: ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      <G stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {children}
      </G>
    </Svg>
  );
}

export const UsersIcon = (p: Props) => (
  <Icon {...p}>
    <Circle cx="9" cy="8" r="3.2" />
    <Path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <Path d="M15.5 5.2a3.2 3.2 0 0 1 0 5.6M17 13.6A5.5 5.5 0 0 1 20.5 19" />
  </Icon>
);

export const ShieldIcon = (p: Props) => (
  <Icon {...p}>
    <Path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />
    <Path d="m9.2 12 2 2 3.8-4" />
  </Icon>
);

export const BellIcon = (p: Props) => (
  <Icon {...p}>
    <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
    <Path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
);

export const BankIcon = (p: Props) => (
  <Icon {...p}>
    <Path d="M4 9.5 12 5l8 4.5M5 20h14M6.5 10.5v7M10.2 10.5v7M13.8 10.5v7M17.5 10.5v7" />
  </Icon>
);

export const DownloadIcon = (p: Props) => (
  <Icon {...p}>
    <Path d="M12 4.5v10.5M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Icon>
);

export const EyeIcon = (p: Props) => (
  <Icon {...p}>
    <Path d="M2.8 12S6.2 5.8 12 5.8 21.2 12 21.2 12 17.8 18.2 12 18.2 2.8 12 2.8 12z" />
    <Circle cx="12" cy="12" r="2.8" />
  </Icon>
);
