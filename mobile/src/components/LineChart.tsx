/**
 * Monthly spending as a rounded mono spline.
 *
 * Straight segments between six points read as a zigzag; a Catmull-Rom curve
 * through the same points reads as a trend, which is what the number is for.
 * The line draws itself in once on mount — a short transition, not a
 * performance.
 *
 * Animated through React Native's own Animated (not Reanimated) because
 * react-native-svg accepts those props directly, which keeps the chart
 * rendering even if the animation never runs.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { MonthTotal } from "@/lib/reports";
import { useMoney } from "@/lib/useMoney";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const HEIGHT = 156;
const PAD_T = 14;
const PAD_B = 10;
const PAD_X = 8; // keeps the end points off the edges

interface Pt {
  x: number;
  y: number;
}

/** Catmull-Rom through the points, emitted as cubic Béziers. */
function splinePath(pts: Pt[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${
      p2.y - (p3.y - p1.y) / 6
    }, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Straight-line length, rounded up — enough for the dash trick to hide the path. */
function approxLength(pts: Pt[]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return Math.ceil(total * 1.3) + 1;
}

export function LineChart({ months }: { months: MonthTotal[] }) {
  const money = useMoney();
  const [width, setWidth] = useState(0);

  const max = Math.max(1, ...months.map((m) => m.total));
  const n = months.length;

  const points = useMemo<(Pt & MonthTotal)[]>(() => {
    if (width <= 0) return [];
    const usable = Math.max(1, width - PAD_X * 2);
    return months.map((m, i) => ({
      ...m,
      x: PAD_X + (n === 1 ? usable / 2 : (i / (n - 1)) * usable),
      y: PAD_T + (1 - m.total / max) * (HEIGHT - PAD_T - PAD_B),
    }));
  }, [months, width, max, n]);

  const line = splinePath(points);
  const area = points.length
    ? `${line} L ${points[points.length - 1].x} ${HEIGHT} L ${points[0].x} ${HEIGHT} Z`
    : "";
  const length = approxLength(points);

  const draw = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!points.length) return;
    draw.setValue(0);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(draw, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.cubic),
        // strokeDashoffset isn't a transform or opacity, so it can't go native.
        useNativeDriver: false,
      }),
      Animated.timing(fade, { toValue: 1, duration: 420, delay: 220, useNativeDriver: true }),
    ]).start();
  }, [draw, fade, points.length, length]);

  const peak = points.length ? points.reduce((a, p) => (p.total > a.total ? p : a), points[0]) : null;

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 && points.length > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="lineArea" x1="0" y1="0" x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#0A0A0A" stopOpacity={0.14} />
                <Stop offset="1" stopColor="#0A0A0A" stopOpacity={0} />
              </LinearGradient>
            </Defs>

            <Path d={area} fill="url(#lineArea)" opacity={0.9} />
            <AnimatedPath
              d={line}
              stroke="#0A0A0A"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${length} ${length}`}
              strokeDashoffset={draw.interpolate({ inputRange: [0, 1], outputRange: [length, 0] })}
            />
          </Svg>
        ) : null}

        {/* Points fade in after the line has drawn past them. */}
        {width > 0 && points.length > 0 ? (
          <Animated.View style={{ position: "absolute", inset: 0, opacity: fade }} pointerEvents="none">
            <Svg width={width} height={HEIGHT}>
              {points.map((p) => {
                const isPeak = p.key === peak?.key;
                return (
                  <Circle
                    key={p.key}
                    cx={p.x}
                    cy={p.y}
                    r={isPeak ? 5 : 3.5}
                    fill={isPeak ? "#0A0A0A" : "#FFFFFF"}
                    stroke="#0A0A0A"
                    strokeWidth={2}
                  />
                );
              })}
            </Svg>
          </Animated.View>
        ) : null}
      </View>

      <View className="mt-2 flex-row justify-between">
        {months.map((m) => (
          <Text key={m.key} className="text-[11px] text-chalk-mute">
            {m.label}
          </Text>
        ))}
      </View>

      {peak && peak.total > 0 ? (
        <Text className="mt-4 text-center text-[13px] text-chalk-mute">
          Highest month: <Text className="font-semibold text-chalk">{peak.label}</Text> at {money.format(peak.total)}
        </Text>
      ) : null}
    </View>
  );
}
