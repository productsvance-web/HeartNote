// Types for the /trends/weight chart. The window-slicing helpers that
// used to live here moved into WeightTrendView once we converted to a
// single ms-based windowing model (drag-to-scrub support). Only the
// types are still shared.

export type WeightReading = {
  id: string; // daily_log_readings.id — needed for delete
  recorded_at: string; // full ISO timestamp
  value: number; // lb
  log_date: string; // YYYY-MM-DD in patient tz (denormalized at insert time)
};

export type WindowPeriod = 'D' | 'W' | 'M' | '6M' | 'Y';
