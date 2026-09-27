/**
 * A counter that increments every time the screen comes into focus.
 *
 * Tab screens stay mounted once visited, so a mount effect runs exactly once
 * and entrance animations only ever played the first time. Passing this tick to
 * `FadeIn` (and the charts) gives them something to react to on every return.
 *
 * Only call this from a screen inside the navigator — the paywall and the
 * sign-in screen render outside it and have no navigation context.
 */
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";

export function useFocusTick(): number {
  const [tick, setTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setTick((t) => t + 1);
    }, []),
  );

  return tick;
}
