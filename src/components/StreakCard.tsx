import { cn } from "@/lib/cn";
import { useStore } from "@/data/store";
import { currentStreak, last7Days } from "@/lib/streak";
import { startOfDay } from "@/lib/format";

/** Gamified logging streak: current run + the last 7 days. */
export function StreakCard() {
  const { data, now } = useStore();
  const streak = currentStreak(data.transactions, now);
  const week = last7Days(data.transactions, now);

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
        <p className="mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight text-chalk tnum">
          {streak} <span className="text-[15px] font-medium text-chalk-mute">{streak === 1 ? "day" : "days"}</span>
        </p>
        <p className="mt-1.5 text-[13px] text-chalk-mute">{streak > 0 ? "Keep it going — log daily." : "Log an expense to start a streak."}</p>
      </div>
      <div className="flex shrink-0 gap-1.5" aria-hidden="true">
        {week.map((done, idx) => (
          <div key={idx} className="flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold",
                done ? "bg-chalk text-ink-950" : "bg-ink-800 text-chalk-faint ring-1 ring-line",
              )}
            >
              {done ? "✓" : ""}
            </span>
            <span className="text-[10px] text-chalk-faint">{letters[idx]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
