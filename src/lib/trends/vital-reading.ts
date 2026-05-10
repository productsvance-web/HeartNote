// Shared reading shape for any single-value vital trend page (weight,
// spo2, resting heart rate, …). One row in daily_log_readings.

export type VitalReading = {
  id: string;
  recorded_at: string;
  value: number;
  log_date: string;
};

export type WindowPeriod = 'D' | 'W' | 'M' | '6M' | 'Y';
