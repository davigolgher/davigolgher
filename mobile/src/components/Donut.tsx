/**
 * Category donut, mono.
 *
 * Each slice is its own circle rotated to where it starts, with a dash pattern
 * long enough that animating the offset makes the arc grow out of that point
 * rather than slide around the ring. Identity is carried by the labels and
 * percentages, never by colour alone — the ramp is grey.
 */
import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import type { CategorySlice } from "@/lib/reports";
import { useMoney } from "@/lib/useMoney";
import { FitNumber } from "./ui";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const GRAYS = ["#0A0A0A", "#3A3A3A", "#5C5C5C", "#7E7E7E", "#9E9E9E", "#BDBDBD", "#D6D6D6", "#E8E8E8"];

const SIZE = 150;
const R = 54;
const C = 2 * Math.PI * R;
const STROKE = 16;
/** White breathing room between slices, in viewBox units of arc. */
const GAP = 3;
/** A slice thinner than the gap would vanish; leave a sliver instead. */
const MIN_ARC = 1.2;

export function Donut({ slices }: { slices: CategorySlice[] }) {
  const money = useMoney();
  const total = slices.reduce((a, s) => a + s.total, 0);

  const sweep = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    sweep.setValue(0);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(sweep, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        // strokeDashoffset can't run on the native driver.
        useNativeDriver: false,
      }),
      Animated.timing(fade, { toValue: 1, duration: 400, delay: 180, useNativeDriver: true }),
    ]).start();
  }, [sweep, fade, slices.length]);

  // A single slice gets no gap — a full ring with a notch cut in it just looks
  // broken. With two or more, the gap is carved off the end of every slice, so
  // the seam where the last one wraps back to the first gets one too.
  const gap = slices.length > 1 ? GAP : 0;

  let offset = 0;
  const rings = slices.map((s, i) => {
    // The exact share, not the rounded `pct`: rounded shares can add up past
    // 100%, and that overflow runs straight over the gap at the top.
    const len = total > 0 ? (s.total / total) * C : 0;
    const dash = len > 0 ? Math.max(len - gap, MIN_ARC) : 0;
    const startDeg = (offset / C) * 360;
    offset += len;
    // Rotate to the slice's start so its dash grows from there. The origin is
    // the ring centre in viewBox units, not screen pixels.
    return (
      <G key={s.category} rotation={startDeg} origin="64, 64">
        <AnimatedCircle
          cx={64}
          cy={64}
          r={R}
          fill="none"
          stroke={GRAYS[i % GRAYS.length]}
          strokeWidth={STROKE}
          strokeDasharray={`${dash} ${C}`}
          strokeDashoffset={sweep.interpolate({ inputRange: [0, 1], outputRange: [dash, 0] })}
        />
      </G>
    );
  });

  return (
    <View>
      <View className="items-center">
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE} viewBox="0 0 128 128">
            <G rotation={-90} origin="64, 64">
              <Circle cx={64} cy={64} r={R} fill="none" stroke="#F1F1F2" strokeWidth={STROKE} />
              {rings}
            </G>
          </Svg>

          {/* Centre total. Shrinks to fit rather than spilling past the ring. */}
          <Animated.View className="absolute inset-0 items-center justify-center" style={{ opacity: fade }}>
            <View style={{ maxWidth: 104 }}>
              <FitNumber className="text-center text-[18px] font-semibold tracking-tight text-chalk">
                {money.format(total)}
              </FitNumber>
            </View>
            <Text className="text-[11px] uppercase tracking-wide text-chalk-mute">spent</Text>
          </Animated.View>
        </View>
      </View>

      <Animated.View className="mt-6" style={{ opacity: fade }}>
        {slices.map((s, i) => (
          <View key={s.category} className="flex-row items-center gap-3 py-1.5">
            <View className="h-3 w-3 shrink-0 rounded-[4px]" style={{ backgroundColor: GRAYS[i % GRAYS.length] }} />
            <Text numberOfLines={1} className="min-w-0 flex-1 text-[15px] text-chalk">
              {s.category}
            </Text>
            <Text className="shrink-0 text-[15px] font-semibold text-chalk">{money.format(s.total)}</Text>
            <Text className="w-10 shrink-0 text-right text-[13px] text-chalk-mute">{s.pct}%</Text>
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
