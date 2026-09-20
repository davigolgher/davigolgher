/**
 * Monthly spending as a line, the companion view to the category donut.
 *
 * Monochrome like the rest of the app: one chalk line over a faint area fill,
 * with the points marked so a six-month series stays readable without colour.
 */
import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import type { MonthTotal } from "@/lib/reports";
import { useMoney } from "@/lib/useMoney";

const HEIGHT = 150;
const PAD_T = 12;
const PAD_B = 8;

export function LineChart({ months }: { months: MonthTotal[] }) {
  const money = useMoney();
  const [width, setWidth] = useState(0);

  const max = Math.max(1, ...months.map((m) => m.total));
  const n = months.length;

  // One point per month, spread across the measured width.
  const points = months.map((m, i) => {
    const x = n === 1 ? width / 2 : (i / (n - 1)) * width;
    const y = PAD_T + (1 - m.total / max) * (HEIGHT - PAD_T - PAD_B);
    return { x, y, ...m };
  });

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${HEIGHT} L ${points[0].x} ${HEIGHT} Z` : "";

  const peak = points.reduce((a, p) => (p.total > a.total ? p : a), points[0]);

  return (
    <View>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              <LinearGradient id="lineArea" x1="0" y1="0" x2="0" y2={HEIGHT} gradientUnits="userSpaceOnUse">
                <Stop offset="0" stopColor="#0A0A0A" stopOpacity={0.12} />
                <Stop offset="1" stopColor="#0A0A0A" stopOpacity={0} />
              </LinearGradient>
            </Defs>

            <Path d={area} fill="url(#lineArea)" />
            <Path d={line} stroke="#0A0A0A" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />

            {points.map((p) => (
              <Circle
                key={p.key}
                cx={p.x}
                cy={p.y}
                r={p.key === peak?.key ? 5 : 3.5}
                fill={p.key === peak?.key ? "#0A0A0A" : "#FFFFFF"}
                stroke="#0A0A0A"
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : null}
      </View>

      <View className="mt-2 flex-row justify-between">
        {months.map((m) => (
          <Text key={m.key} className="text-[11px] text-chalk-faint">
            {m.label}
          </Text>
        ))}
      </View>

      {peak ? (
        <Text className="mt-4 text-center text-[13px] text-chalk-mute">
          Highest month: <Text className="font-semibold text-chalk">{peak.label}</Text> at {money.format(peak.total)}
        </Text>
      ) : null}
    </View>
  );
}
