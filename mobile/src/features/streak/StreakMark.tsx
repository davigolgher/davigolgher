/**
 * The streak's symbol: a ring that closes.
 *
 * Each reviewed day closes the loop. The shape carries the state, so it reads
 * in black and white alone — no colour, no flame:
 *
 *   empty    a dashed ring        — nothing started, or starting again
 *   open     a ring with a gap    — the run is alive; today is still open
 *   closed   a full ring + core   — today is done
 *   + halo   a faint outer ring   — the day a milestone is reached
 *
 * The same geometry as the donut in Reports (round caps, one stroke weight), so
 * it belongs to the app rather than to a game. Decorative to screen readers:
 * the view around it says the same thing in words.
 */
import { Animated, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const VB = 48;
const C0 = VB / 2;
const R = 17;
const STROKE = 2.8;
const CIRC = 2 * Math.PI * R;
/** The open gap, in degrees, centred at twelve o'clock. */
const GAP_DEG = 70;
const GAP = (CIRC * GAP_DEG) / 360;
const DOT = 5.5;
const HALO_R = 22.5;

const INK = "#0A0A0A";
const FAINT = "#AEAEB4";

export type MarkState = "empty" | "open" | "closed";

export interface MarkAnimation {
  close: Animated.Value;
  pop: Animated.Value;
  halo: Animated.Value;
}

export function StreakMark({
  size,
  state,
  milestone = false,
  anim,
}: {
  size: number;
  state: MarkState;
  milestone?: boolean;
  /** Present while the day is being completed: the ring closes on it. */
  anim?: MarkAnimation | null;
}) {
  // The dash starts just clockwise of the top and runs round to just short of
  // it, so the gap sits centred at twelve o'clock and closes from one side.
  const rotation = -90 + GAP_DEG / 2;

  let ring: React.ReactNode;
  let dot: React.ReactNode = null;

  if (anim) {
    ring = (
      <AnimatedCircle
        cx={C0}
        cy={C0}
        r={R}
        fill="none"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${CIRC} ${CIRC}`}
        strokeDashoffset={anim.close.interpolate({ inputRange: [0, 0.6], outputRange: [GAP, 0], extrapolate: "clamp" })}
      />
    );
    dot = (
      <AnimatedCircle
        cx={C0}
        cy={C0}
        fill={INK}
        r={anim.close.interpolate({ inputRange: [0.45, 1], outputRange: [0, DOT], extrapolate: "clamp" })}
      />
    );
  } else if (state === "empty") {
    ring = (
      <Circle
        cx={C0}
        cy={C0}
        r={R}
        fill="none"
        stroke={FAINT}
        strokeWidth={STROKE * 0.85}
        strokeLinecap="round"
        strokeDasharray="0.1 5.2"
      />
    );
  } else {
    ring = (
      <Circle
        cx={C0}
        cy={C0}
        r={R}
        fill="none"
        stroke={INK}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${CIRC} ${CIRC}`}
        strokeDashoffset={state === "open" ? GAP : 0}
      />
    );
    if (state === "closed") dot = <Circle cx={C0} cy={C0} r={DOT} fill={INK} />;
  }

  // The halo breathes out once and settles where the static one sits, so the
  // hand-over when the celebration ends is invisible.
  const halo =
    anim && milestone ? (
      <AnimatedCircle
        cx={C0}
        cy={C0}
        fill="none"
        stroke={INK}
        strokeWidth={1.2}
        r={anim.halo.interpolate({ inputRange: [0, 1], outputRange: [R, HALO_R] })}
        strokeOpacity={anim.halo.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.45, 0.28] })}
      />
    ) : milestone && state === "closed" ? (
      <Circle cx={C0} cy={C0} r={HALO_R} fill="none" stroke={INK} strokeWidth={1.2} strokeOpacity={0.28} />
    ) : null;

  const svg = (
    <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
      {halo}
      <G rotation={rotation} origin={`${C0}, ${C0}`}>
        {ring}
      </G>
      {dot}
    </Svg>
  );

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {anim ? <Animated.View style={{ transform: [{ scale: anim.pop }] }}>{svg}</Animated.View> : svg}
    </View>
  );
}
