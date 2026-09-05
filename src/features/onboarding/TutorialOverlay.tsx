import { useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui";
import { BarChartIcon, PlusIcon, RepeatIcon, WalletIcon } from "@/components/icons";
import { useFlow } from "@/features/flow/FlowProvider";

const STEPS = [
  { icon: <WalletIcon size={22} />, title: "This is your month", body: "Total spent, your budget, and what's left — at a glance on Home." },
  { icon: <PlusIcon size={22} strokeWidth={2.2} />, title: "Add an expense", body: "Tap “Add Expense”, type an amount, pick a category. That's it." },
  { icon: <BarChartIcon size={22} />, title: "See the breakdown", body: "Reports shows where your money goes, by category and by month." },
  { icon: <RepeatIcon size={22} />, title: "Track subscriptions", body: "Add recurring charges so a renewal never takes you by surprise." },
];

/** One-time "how this works" tour, shown after sign-up + payment. */
export function TutorialOverlay() {
  const { finishTutorial } = useFlow();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50">
      <div className="w-full max-w-app rounded-t-sheet border-t border-line bg-ink-950 px-6 pb-safe pt-6 animate-fade-up">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[16px] bg-ink-800 text-chalk ring-1 ring-line">{step.icon}</span>
        <h2 className="mt-4 text-xl font-bold tracking-tight text-chalk">{step.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-chalk-mute">{step.body}</p>

        <div className="mt-5 flex items-center gap-1.5">
          {STEPS.map((s, idx) => (
            <span key={s.title} className={cn("h-1 flex-1 rounded-full transition-colors", idx <= i ? "bg-chalk" : "bg-ink-700")} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 pb-2">
          <button type="button" onClick={finishTutorial} className="text-[13px] font-medium text-chalk-mute hover:text-chalk">
            Skip
          </button>
          <Button variant="primary" onClick={() => (last ? finishTutorial() : setI(i + 1))}>
            {last ? "Start using Wallet Flow" : "Next"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
