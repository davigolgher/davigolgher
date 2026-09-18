/**
 * Category donut — the react-native-svg counterpart of the web app's Donut.
 *
 * Same construction: one circle per slice, sized with strokeDasharray and
 * pushed around the ring with strokeDashoffset, the whole ring rotated -90° so
 * it starts at twelve o'clock. Identity is carried by the labels and
 * percentages, never by colour alone — the ramp is monochrome.
 */
import { Text, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import type { CategorySlice } from "@/lib/reports";
import { useMoney } from "@/lib/useMoney";
import { FitNumber } from "./ui";

const GRAYS = ["#0A0A0A", "#3A3A3A", "#5C5C5C", "#7E7E7E", "#9E9E9E", "#BDBDBD", "#D6D6D6", "#E8E8E8"];

const SIZE = 150;
const R = 54;
const C = 2 * Math.PI * R;
const STROKE = 16;

export function Donut({ slices }: { slices: CategorySlice[] }) {
  const money = useMoney();
  const total = slices.reduce((a, s) => a + s.total, 0);

  let offset = 0;
  const rings = slices.map((s, i) => {
    const len = (s.pct / 100) * C;
    const dash = Math.max(0, len - 2); // 2px surface gap between slices
    const ring = (
      <Circle
        key={s.category}
        cx={64}
        cy={64}
        r={R}
        fill="none"
        stroke={GRAYS[i % GRAYS.length]}
        strokeWidth={STROKE}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={-offset}
      />
    );
    offset += len;
    return ring;
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
          <View className="absolute inset-0 items-center justify-center">
            <View style={{ maxWidth: 104 }}>
              <FitNumber className="text-center text-[18px] font-semibold tracking-tight text-chalk">
                {money.format(total)}
              </FitNumber>
            </View>
            <Text className="text-[11px] uppercase tracking-wide text-chalk-faint">spent</Text>
          </View>
        </View>
      </View>

      <View className="mt-6">
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
      </View>
    </View>
  );
}
