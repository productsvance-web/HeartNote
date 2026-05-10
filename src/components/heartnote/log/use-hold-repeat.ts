// Long-press auto-repeat for the ± stepper buttons.
//
//   - Tap (release before 400 ms): single tick.
//   - Hold ≥ 400 ms: repeat every 200 ms.
//   - Hold ≥ 1.9 s total: accelerate to 80 ms.
//   - Hold ≥ 3.9 s total: accelerate to 30 ms.
//   - Release at any point: stop, fire one final tick if no repeat ran yet.
//
// Returns event handlers to spread onto the button. Pointer events cover
// the modern path (mobile + desktop); touch + mouse fall back for older
// engines that haven't normalized to PointerEvent.

'use client';

import { useEffect, useRef } from 'react';

const HOLD_DELAY_MS = 400;
const PHASE_1_INTERVAL_MS = 200;
const PHASE_2_INTERVAL_MS = 80;
const PHASE_3_INTERVAL_MS = 30;
const PHASE_2_AT_MS = 1900; // 400 (hold) + 1500
const PHASE_3_AT_MS = 3900; // 1900 + 2000

export function useHoldRepeat(onTick: () => void) {
  const onTickRef = useRef(onTick);
  useEffect(() => {
    onTickRef.current = onTick;
  });

  const startedAtRef = useRef<number | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const repeatTimerRef = useRef<number | null>(null);
  const repeatedRef = useRef(false);

  const clearTimers = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (repeatTimerRef.current !== null) {
      window.clearTimeout(repeatTimerRef.current);
      repeatTimerRef.current = null;
    }
  };

  // scheduleNext + start are called only from pointer event handlers, not
  // from render. Date.now() is the only correct way to measure elapsed
  // press time; the react-hooks/purity rule's impurity-during-render check
  // is a false positive here because these closures never run synchronously
  // during render.

  const scheduleNext = () => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const elapsed = startedAtRef.current ? now - startedAtRef.current : 0;
    const interval =
      elapsed >= PHASE_3_AT_MS
        ? PHASE_3_INTERVAL_MS
        : elapsed >= PHASE_2_AT_MS
          ? PHASE_2_INTERVAL_MS
          : PHASE_1_INTERVAL_MS;
    repeatTimerRef.current = window.setTimeout(() => {
      onTickRef.current();
      scheduleNext();
    }, interval);
  };

  const start = () => {
    // Already running (e.g. pointerdown then touchstart on the same press).
    if (startedAtRef.current !== null) return;
    startedAtRef.current = Date.now();
    repeatedRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      repeatedRef.current = true;
      onTickRef.current();
      scheduleNext();
    }, HOLD_DELAY_MS);
  };

  const stop = () => {
    if (startedAtRef.current === null) return;
    const wasRepeating = repeatedRef.current;
    clearTimers();
    startedAtRef.current = null;
    repeatedRef.current = false;
    // Tap (no repeat fired) → single tick on release. Caregivers expect a
    // ±1 step on a single tap; without this, the press would do nothing.
    if (!wasRepeating) {
      onTickRef.current();
    }
  };

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimers();
      startedAtRef.current = null;
    };
  }, []);

  return {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      // Capture so a drag-off-the-button still fires pointerup on this element.
      e.currentTarget.setPointerCapture?.(e.pointerId);
      start();
    },
    onPointerUp: stop,
    onPointerCancel: stop,
    onPointerLeave: stop,
  };
}
