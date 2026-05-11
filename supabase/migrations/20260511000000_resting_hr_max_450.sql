-- Raise the resting_hr upper bound from 220 bpm to 450 bpm.
-- Pre-launch, zero customers — direct constraint replacement is safe.

alter table public.daily_log_readings
  drop constraint if exists daily_log_readings_check;

alter table public.daily_log_readings
  add constraint daily_log_readings_check check (
    (field = 'weight_lb'    and value >= 50 and value <= 1000) or
    (field = 'resting_hr'   and value >= 30 and value <= 450) or
    (field = 'spo2'         and value >= 50 and value <= 100) or
    (field = 'systolic_bp'  and value >= 60 and value <= 250) or
    (field = 'diastolic_bp' and value >= 30 and value <= 150)
  );
