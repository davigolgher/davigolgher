/**
 * Haptics, kept rare so they keep meaning something.
 *
 * One per user action, fired in the same frame as the change it confirms, and
 * never the only feedback: plenty of people have system haptics off, so each
 * of these goes with something visible on screen.
 */
import * as Haptics from "expo-haptics";

function fire(play: () => Promise<void>) {
  try {
    play().catch(() => {});
  } catch {
    // No haptics engine here (the web build, some simulators).
  }
}

/** A choice changed: a segment, a chip, a plan. Not fired when re-tapping the current one. */
export function hapticSelection() {
  fire(() => Haptics.selectionAsync());
}

/** Something was saved. */
export function hapticSuccess() {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** A press-and-hold registered, as the confirmation it opens appears. */
export function hapticHold() {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}
