import { useMoney } from "@/lib/useMoney";
import { FitText } from "@/components/ui";
import type { CategorySlice } from "@/lib/reports";

// Monochrome ramp (dark → light). Identity is also carried by the labels/%,
// never by color alone.
const GRAYS = ["#0A0A0A", "#3A3A3A", "#5C5C5C", "#7E7E7E", "#9E9E9E", "#BDBDBD", "#D6D6D6", "#E8E8E8"];

export function Donut({ slices }: { slices: CategorySlice[] }) {
  const money = useMoney();
  const total = slices.reduce((a, s) => a + s.total, 0);

  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div>
      <div className="flex justify-center">
        <div className="relative h-[150px] w-[150px]">
          <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
            <circle cx="64" cy="64" r={R} fill="none" stroke="#F1F1F2" strokeWidth="16" />
            {slices.map((s, i) => {
              const len = (s.pct / 100) * C;
              const dash = Math.max(0, len - 2); // 2px surface gap between slices
              const el = (
                <circle
                  key={s.category}
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke={GRAYS[i % GRAYS.length]}
                  strokeWidth="16"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <FitText maxRem={1.1} minRem={0.6} className="mx-auto max-w-[6.5rem] text-center" spanClassName="font-semibold tracking-tight text-chalk tnum">
              {money.format(total)}
            </FitText>
            <span className="text-[11px] uppercase tracking-wide text-chalk-faint">spent</span>
          </div>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {slices.map((s, i) => (
          <li key={s.category} className="flex items-center gap-3">
            <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: GRAYS[i % GRAYS.length] }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[15px] text-chalk">{s.category}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-chalk">{money.format(s.total)}</span>
            <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-chalk-mute">{s.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
