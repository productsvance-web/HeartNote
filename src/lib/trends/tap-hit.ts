// Hit-test helper for tap-to-select on the trend charts. Given a tap
// position on a chart wrapper, find the nearest data point and decide
// whether the tap is close enough to count as a selection.
//
// The chart wrappers carry pointer events for drag-to-scrub; tap is
// distinguished by "no movement between pointerdown and pointerup."
// Once a tap is detected, this helper converts the pixel x back into a
// timestamp and picks the nearest reading by absolute time distance.

export const TAP_MOVE_THRESHOLD_PX = 6;
// Default tap-hit radius: 6% of the visible window width. Compromise
// between "easy to hit even a sparse weekly trace" and "doesn't auto-
// select when the caregiver tapped between two distant dots."
export const DEFAULT_TAP_THRESHOLD_FRACTION = 0.06;

export function findTappedReading<T extends { recorded_at: string }>(
  visible: T[],
  startMs: number,
  endMs: number,
  xPx: number,
  widthPx: number,
  thresholdFraction = DEFAULT_TAP_THRESHOLD_FRACTION,
): T | null {
  if (visible.length === 0 || widthPx <= 0) return null;
  const span = endMs - startMs;
  if (span <= 0) return null;
  const tappedMs = startMs + (xPx / widthPx) * span;
  const thresholdMs = span * thresholdFraction;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const r of visible) {
    const dist = Math.abs(Date.parse(r.recorded_at) - tappedMs);
    if (dist < bestDist) {
      best = r;
      bestDist = dist;
    }
  }
  return best && bestDist <= thresholdMs ? best : null;
}

// Per-bucket variant for HR's range-bar mode. Each bucket has a
// pre-computed recordedAtMs (noon of the day, or week-anchor for 6M/Y).
export function findTappedBucket<T extends { recordedAtMs: number }>(
  buckets: T[],
  startMs: number,
  endMs: number,
  xPx: number,
  widthPx: number,
  thresholdFraction = DEFAULT_TAP_THRESHOLD_FRACTION,
): T | null {
  if (buckets.length === 0 || widthPx <= 0) return null;
  const span = endMs - startMs;
  if (span <= 0) return null;
  const tappedMs = startMs + (xPx / widthPx) * span;
  const thresholdMs = span * thresholdFraction;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const b of buckets) {
    const dist = Math.abs(b.recordedAtMs - tappedMs);
    if (dist < bestDist) {
      best = b;
      bestDist = dist;
    }
  }
  return best && bestDist <= thresholdMs ? best : null;
}
