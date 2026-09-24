/**
 * The streak number. When a day is completed it rolls: the old count lifts
 * away and the new one rises into place. Otherwise it's plain text.
 *
 * Tabular figures so 9 → 10 doesn't shuffle the layout mid-roll, and a cap on
 * Dynamic Type scaling so the largest accessibility sizes still fit the card.
 */
import { Animated, Text, View, type TextStyle } from "react-native";

export function RollingCount({
  value,
  from,
  roll,
  size,
  color,
}: {
  value: number;
  /** The count rolling away, while a completion is being played. */
  from: number | null;
  roll: Animated.Value;
  size: number;
  color: string;
}) {
  const style: TextStyle = {
    fontSize: size,
    lineHeight: size * 1.08,
    fontWeight: "700",
    letterSpacing: -size * 0.03,
    color,
    fontVariant: ["tabular-nums"],
  };

  if (from === null) {
    return (
      <Text style={style} maxFontSizeMultiplier={1.4}>
        {value}
      </Text>
    );
  }

  const shift = size * 0.45;
  return (
    <View style={{ overflow: "hidden" }}>
      {/* Sizes the box to the wider of the two numbers. */}
      <Text style={[style, { opacity: 0 }]} maxFontSizeMultiplier={1.4}>
        {String(Math.max(value, from))}
      </Text>
      <Animated.Text
        maxFontSizeMultiplier={1.4}
        style={[
          style,
          {
            position: "absolute",
            left: 0,
            opacity: roll.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: "clamp" }),
            transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -shift] }) }],
          },
        ]}
      >
        {from}
      </Animated.Text>
      <Animated.Text
        maxFontSizeMultiplier={1.4}
        style={[
          style,
          {
            position: "absolute",
            left: 0,
            opacity: roll.interpolate({ inputRange: [0.3, 1], outputRange: [0, 1], extrapolate: "clamp" }),
            transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }],
          },
        ]}
      >
        {value}
      </Animated.Text>
    </View>
  );
}
