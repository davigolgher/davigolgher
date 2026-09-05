import { useState } from "react";
import { BottomSheet, Button, useToast } from "@/components/ui";
import { useFlow } from "@/features/flow/FlowProvider";

/**
 * "How would you rate this app?" prompt. On 4–5 stars we'd open the native
 * App Store review dialog (needs Expo/native); here we simulate it.
 */
export function RatingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { finishRating } = useFlow();
  const { toast } = useToast();
  const [hover, setHover] = useState(0);
  const [rating, setRating] = useState(0);

  const submit = (value: number) => {
    setRating(value);
    finishRating();
    if (value >= 4) {
      toast({ message: "Thanks! Opening the App Store review…" });
    } else {
      toast({ message: "Thanks for the feedback!" });
    }
    setTimeout(onClose, 400);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Enjoying Wallet Flow?" description="How would you rate the app?">
      <div className="flex justify-center gap-2 py-2" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = (hover || rating) >= n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              onClick={() => submit(n)}
              className="p-1 text-4xl leading-none transition-transform hover:scale-110"
            >
              <span className={filled ? "text-chalk" : "text-ink-700"}>★</span>
            </button>
          );
        })}
      </div>
      <Button variant="ghost" fullWidth className="mt-2" onClick={() => { finishRating(); onClose(); }}>
        Not now
      </Button>
    </BottomSheet>
  );
}
