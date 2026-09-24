/**
 * The moment a day is completed.
 *
 * One short, coordinated beat, played once:
 *
 *   0 ms     today's marker fills                  220 ms
 *   140 ms   the count rolls to the new number     240 ms
 *   280 ms   the ring closes and its core lands    220 ms   ← haptic
 *   440 ms   the symbol gives one small pop        260 ms
 *   600 ms   the message arrives                   200 ms
 *   640 ms   (milestones only) a halo ring breathes out once   460 ms
 *
 * About 0.8 s, or 1.1 s for a milestone. Nothing blocks input and nothing loops.
 *
 * It only ever plays for a completion made in this session. The review screen
 * queues it; whichever streak view comes into focus next takes it. Data
 * arriving from the server — a launch, a refresh, a day reviewed on another
 * phone — never queues anything, so reopening the app never replays it.
 *
 * With Reduce Motion on, nothing scales, slides or draws: the new state is
 * simply there, and the message fades in. The haptic stays — it isn't motion.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing } from "react-native";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";

const queued = new Set<string>();

/** Called by the review screen once the server has the day. */
export function queueCelebration(dayKey: string): void {
  queued.add(dayKey);
}

/** Take it if it's still waiting. Only one view ever gets it. */
function takeCelebration(dayKey: string): boolean {
  return queued.delete(dayKey);
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

export interface Celebration {
  /** Non-null while a celebration is on screen; views switch to their animated forms. */
  run: { from: number; milestone: number | null } | null;
  fill: Animated.Value;
  roll: Animated.Value;
  close: Animated.Value;
  pop: Animated.Value;
  message: Animated.Value;
  halo: Animated.Value;
  reduced: boolean;
}

const ease = Easing.out(Easing.cubic);

/**
 * @param doneToday  whether today is reviewed, from the summary
 * @param current    the count now (today included)
 * @param milestone  the milestone reached today, if any
 * @param lead       ms to wait after focus before starting — long enough for
 *                   the view's own entrance to settle, so the beat is seen
 */
export function useStreakCelebration(
  todayKey: string,
  doneToday: boolean,
  current: number,
  milestone: number | null,
  lead: number,
): Celebration {
  const reduced = useReducedMotion();
  const v = useRef({
    fill: new Animated.Value(1),
    roll: new Animated.Value(1),
    close: new Animated.Value(1),
    pop: new Animated.Value(1),
    message: new Animated.Value(1),
    halo: new Animated.Value(0),
  }).current;
  const [run, setRun] = useState<Celebration["run"]>(null);

  const focused = useRef(false);
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      setFocusTick((n) => n + 1);
      return () => {
        focused.current = false;
      };
    }, []),
  );

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!focused.current || !doneToday || !takeCelebration(todayKey)) return;

    // Completing today always adds exactly one: yesterday's run, plus today.
    setRun({ from: current - 1, milestone });
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, lead + ms));

    const haptic = () =>
      (milestone
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      ).catch(() => {});

    if (reduced) {
      v.fill.setValue(1);
      v.roll.setValue(1);
      v.close.setValue(1);
      v.pop.setValue(1);
      v.halo.setValue(0);
      v.message.setValue(0);
      at(0, () => {
        haptic();
        Animated.timing(v.message, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => setRun(null));
      });
      return;
    }

    v.fill.setValue(0);
    v.roll.setValue(0);
    v.close.setValue(0);
    v.pop.setValue(1);
    v.message.setValue(0);
    v.halo.setValue(0);

    at(0, () => Animated.timing(v.fill, { toValue: 1, duration: 220, easing: ease, useNativeDriver: true }).start());
    at(140, () => Animated.timing(v.roll, { toValue: 1, duration: 240, easing: ease, useNativeDriver: true }).start());
    // SVG geometry can't run on the native driver; it's one ring for a fifth of a second.
    at(280, () => Animated.timing(v.close, { toValue: 1, duration: 220, easing: ease, useNativeDriver: false }).start());
    at(440, () => {
      haptic();
      Animated.sequence([
        Animated.timing(v.pop, { toValue: 1.12, duration: 120, easing: ease, useNativeDriver: true }),
        Animated.timing(v.pop, { toValue: 1, duration: 140, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
    at(600, () =>
      Animated.timing(v.message, { toValue: 1, duration: 200, easing: ease, useNativeDriver: true }).start(() => {
        if (!milestone) setRun(null);
      }),
    );
    if (milestone) {
      at(640, () =>
        Animated.timing(v.halo, { toValue: 1, duration: 460, easing: ease, useNativeDriver: false }).start(() => {
          setRun(null);
        }),
      );
    }
    // Only a focus or a newly completed day should start this; `current`,
    // `milestone`, `lead` and `reduced` are read as they are at that moment.
  }, [focusTick, doneToday, todayKey]);

  return { run, ...v, reduced };
}
