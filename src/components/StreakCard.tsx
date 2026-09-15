import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/data/store";
import { currentStreak, last7Days } from "@/lib/streak";
import { activeDaySet } from "@/lib/activity";
import { startOfDay } from "@/lib/format";

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Count a number up to `target` (from the previous value) with an eased ramp. */
function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = target;
    if (prefersReducedMotion() || from === target) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Orange/red flame (Duolingo-style). Static — no flicker. */
function Flame({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="flameOuter" x1="12" y1="1.5" x2="12" y2="22.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFB020" />
          <stop offset="0.5" stopColor="#FF6A00" />
          <stop offset="1" stopColor="#E4320B" />
        </linearGradient>
        <linearGradient id="flameInner" x1="12" y1="11" x2="12" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFE35A" />
          <stop offset="1" stopColor="#FF8A00" />
        </linearGradient>
      </defs>
      <path d="M12 1.6c1.1 3.3 3.1 4.8 4.4 6.7a7 7 0 1 1-10 .7c.9 1.2 2.1 1.8 3.1 1.8C7.6 8.1 9.2 4 12 1.6Z" fill="url(#flameOuter)" />
      <path d="M12.1 11.7c1 1.1 1.7 2.1 1.7 3.4a2.9 2.9 0 1 1-4.7-2.2c.3.6.8 1 1.5 1.1-.8-1.3.3-2.5 1.5-2.3Z" fill="url(#flameInner)" />
    </svg>
  );
}

/** Gamified streak: lights up from using the app; current run + the last 7 days. */
export function StreakCard() {
  const { data, now } = useStore();
  const active = activeDaySet(now);
  const streak = currentStreak(data.transactions, now, active);
  const week = last7Days(data.transactions, now, active);
  const display = useCountUp(streak);

  const today = startOfDay(now);
  const letters = week.map((_, idx) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (6 - idx));
    return new Intl.DateTimeFormat("en-US", { weekday: "narrow" }).format(d);
  });

  return (
    <div className="flex items-center justify-between gap-4 rounded-card border border-line bg-ink-850 p-5">
      <div>
        <p className="text-eyebrow uppercase text-chalk-faint">Streak</p>
        <p className="mt-1.5 flex items-center gap-1.5 text-[1.75rem] font-semibold leading-none tracking-tight text-chalk tnum">
          {streak > 0 && <Flame />}
          {display} <span className="text-[15px] font-medium text-chalk-mute">{streak === 1 ? "day" : "days"}</span>
        </p>
        <p className="mt-1.5 text-[13px] text-chalk-mute">{streak > 0 ? "Keep it going — open Flow daily." : "Open the app daily to build a streak."}</p>
      </div>
      <div className="flex shrink-0 gap-1.5 pr-1" aria-hidden="true">
        {week.map((done, idx) => {
          const isToday = idx === week.length - 1;
          return (
            <div key={idx} className="flex flex-col items-center gap-1.5">
              <span
                style={{ animationDelay: `${idx * 55}ms` }}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold animate-pop-in",
                  done ? "bg-chalk text-ink-950" : "bg-ink-800 text-chalk-faint ring-1 ring-line",
                  isToday && done && "ring-2 ring-chalk/30 ring-offset-2 ring-offset-ink-850",
                )}
              >
                {done ? "✓" : ""}
              </span>
              <span className="text-[10px] text-chalk-faint">{letters[idx]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
