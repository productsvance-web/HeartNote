// Pure y-axis scaler for vital trend charts. Picks "nice" tick intervals
// from the dataset, with optional floor / ceiling clamps so a clinical
// safety line (e.g. SpO2's 88% 911 floor) stays on screen regardless of
// the actual data range.
//
// Hoisted out of WeightTrendView so weight + spo2 can share the
// algorithm. Has no React imports — safe in both client and server
// bundles.

const NICE_MULTIPLIERS = [1, 2, 5];
const DEFAULT_SINGLE_VALUE_HALF_RANGE = 10;

export interface YScaleOptions {
  // Clamp the resulting min to ≤ floor. Used by SpO2 so the 88% line is
  // always within the visible range.
  floor?: number;
  // Clamp the resulting max to ≤ ceiling. Used by SpO2 to keep 100% as
  // the physiological top.
  ceiling?: number;
  // Half-range used for the single-reading (and all-identical) centered
  // axis. Defaults to 10 (the weight value).
  singleValueHalfRange?: number;
}

export interface YScale {
  min: number;
  max: number;
  ticks: number[];
}

export function yScaleFor(
  readings: { value: number }[],
  options: YScaleOptions = {},
): YScale {
  const floor = options.floor;
  const ceiling = options.ceiling;
  const halfRange = options.singleValueHalfRange ?? DEFAULT_SINGLE_VALUE_HALF_RANGE;

  // Empty dataset — bare scaffold. If floor/ceiling supplied, the chart
  // still wants to show those bounds (so the SpO2 floor line is visible
  // on a never-logged page).
  if (readings.length === 0) {
    if (floor !== undefined && ceiling !== undefined) {
      return fourLabelClamped(floor, ceiling);
    }
    return { min: 0, max: 150, ticks: [0, 50, 100, 150] };
  }

  // Min/max of the data.
  const values = readings.map((r) => r.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);

  // Single reading OR all readings identical → 3-label centered axis,
  // then clamp to floor/ceiling if supplied (which expands back to 4).
  if (readings.length === 1 || lo === hi) {
    const v = readings[0].value;
    const step = halfRange;
    const mid = Math.round(v / step) * step;
    const naive = {
      min: mid - step,
      max: mid + step,
      ticks: [mid - step, mid, mid + step],
    };
    if (floor === undefined && ceiling === undefined) return naive;
    // floor extends min DOWN to ensure the floor line is visible.
    // ceiling clamps max DOWN only when data fits below it; if the
    // reading exceeds the ceiling, the chart adapts UP instead of
    // hiding the reading above the frame.
    const clampMin =
      floor !== undefined ? Math.min(naive.min, floor) : naive.min;
    const clampMax =
      ceiling !== undefined && v <= ceiling
        ? Math.min(naive.max, ceiling)
        : naive.max;
    return fourLabelClamped(clampMin, clampMax);
  }

  // 2+ distinct readings: nice-step axis padded so neither extreme lands
  // on the chart edge.
  const span = hi - lo;
  const padding = Math.max(1, span * 0.1);
  const paddedLo = lo - padding;
  const paddedHi = hi + padding;
  let step = niceStep((paddedHi - paddedLo) / 3);
  let min = Math.floor(paddedLo / step) * step;
  let max = min + step * 3;
  while (max < paddedHi) {
    step = niceStep(step + 1);
    min = Math.floor(paddedLo / step) * step;
    max = min + step * 3;
  }

  // floor pulls min DOWN if necessary to keep the floor line visible.
  if (floor !== undefined) min = Math.min(min, floor);
  // ceiling clamps max DOWN only when data fits below it; if any
  // reading exceeds the ceiling, the chart adapts UP rather than
  // hiding readings above the frame. This is the fix for HR 220
  // making the chart ticks collapse to [0, 50, 100, 110] with the
  // reading invisible above 110.
  if (ceiling !== undefined && hi <= ceiling) max = Math.min(max, ceiling);

  // If clamping changed min/max, recompute ticks so all four labels stay
  // within [min, max] at nice intervals.
  if (floor !== undefined || ceiling !== undefined) {
    return fourLabelClamped(min, max);
  }
  return { min, max, ticks: [min, min + step, min + 2 * step, max] };
}

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exponent);
  for (const m of NICE_MULTIPLIERS) {
    if (m * base >= rawStep) return m * base;
  }
  return 10 * base;
}

// Distribute four ticks across [min, max] at a nice-step. Used post-
// clamp so the clamped range still reads as a 4-label axis. Ensures all
// four ticks are distinct.
function fourLabelClamped(min: number, max: number): YScale {
  if (max <= min) {
    return { min, max: min + 1, ticks: [min, min, min, min + 1] };
  }
  const step = niceStep((max - min) / 3);
  const t0 = min;
  const t1 = min + step;
  const t2 = min + step * 2;
  const t3 = max;
  // Dedupe if step+step*2 collide with max.
  const ticks = [t0, t1, t2, t3];
  return { min, max, ticks };
}
