import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { useStore } from "@/data/store";
import { currentStreak, last7Days } from "@/lib/streak";
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

function Flame({ className }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12.5 2c.6 2.7 2.3 4 3.6 5.6a6.5 6.5 0 1 1-9.1.4c.5.9 1.4 1.4 2.3 1.5-1.4-2.5.2-5.6 3.2-7.5z" opacity="0.9" />
      <path d="M12 12.5c.9 1 1.6 1.8 1.6 3a2.6 2.6 0 1 1-4.2-2c.2.5.6.9 1.1 1-.7-1.2.3-2.3 1.5-2z" fill="#FFFFFF" opacity="0.5" />
    </svg>
  );
}

/** Gamified logging streak: current run + the last 7 days, animated. */
export function StreakCard() {
  const { data, now } = useStore();
  const streak = currentStreak(data.transactions, now);
  const week = last7Days(data.transactions, now);
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
          {streak > 0 && <Flame className="origin-bottom animate-flame text-chalk" />}
          {display} <span className="text-[15px] font-medium text-chalk-mute">{streak === 1 ? "day" : "days"}</span>
        </p>
        <p className="mt-1.5 text-[13px] text-chalk-mute">{streak > 0 ? "Keep it going — log daily." : "Log an expense to start a streak."}</p>
      </div>
      <div className="flex shrink-0 gap-1.5" aria-hidden="true">
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
