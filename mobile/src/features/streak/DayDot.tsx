/**
 * One day in the streak's week row and calendar.
 *
 * Told apart by fill, outline and symbol — never by colour alone:
 *
 *   done     solid black, white check
 *   today    black ring, empty — still open
 *   missed   solid pale grey — a day that went by
 *   future   hairline ring — not here yet
 *   idle     hairline ring — before this account's first review, so a new
 *            user's first week doesn't open on a row of misses
 */
import { Animated, Text, View } from "react-native";
import type { DayMark } from "@/lib/streak";
import { CheckIcon } from "~/components/icons";

const INK = "#0A0A0A";

export function DayDot({
  mark,
  size,
  number,
  fill,
}: {
  mark: DayMark;
  size: number;
  /** A calendar date to show inside, instead of the check. */
  number?: number;
  /** While today is being completed: 0 → 1 as the black fills in. */
  fill?: Animated.Value | null;
}) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  const check = Math.round(size * 0.46);

  const doneFace = (
    <View style={[box, { backgroundColor: INK, alignItems: "center", justifyContent: "center" }]}>
      {number !== undefined ? (
        <Text style={{ color: "#FFFFFF", fontSize: size * 0.4, fontWeight: "700" }} maxFontSizeMultiplier={1.2}>
          {number}
        </Text>
      ) : (
        <CheckIcon size={check} color="#FFFFFF" strokeWidth={2.4} />
      )}
    </View>
  );

  if (fill) {
    // The open ring stays underneath; the black face grows over it.
    return (
      <View style={box}>
        <View style={[box, { position: "absolute", borderWidth: 2, borderColor: INK }]} />
        <Animated.View
          style={{
            position: "absolute",
            opacity: fill,
            transform: [{ scale: fill.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }],
          }}
        >
          {doneFace}
        </Animated.View>
      </View>
    );
  }

  if (mark === "done") return doneFace;

  const label =
    number !== undefined ? (
      <Text
        maxFontSizeMultiplier={1.2}
        style={{
          fontSize: size * 0.4,
          fontWeight: mark === "today" ? "700" : "500",
          color: mark === "future" || mark === "idle" ? "#8A8A8F" : mark === "missed" ? "#6E6E73" : INK,
        }}
      >
        {number}
      </Text>
    ) : null;

  const face =
    mark === "today"
      ? { borderWidth: 2, borderColor: INK, backgroundColor: "#FFFFFF" }
      : mark === "missed"
        ? { backgroundColor: number !== undefined ? "transparent" : "#E7E7E9" }
        : // future / idle: a hairline, or nothing at all behind a calendar number
          number !== undefined
          ? { backgroundColor: "transparent" }
          : { borderWidth: 1, borderColor: "rgba(0,0,0,0.14)", backgroundColor: "#FFFFFF" };

  return <View style={[box, face, { alignItems: "center", justifyContent: "center" }]}>{label}</View>;
}
