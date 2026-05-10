-- Raise the weight_lb upper bound from 700 lb to 1000 lb. The 700 cap
-- was rejecting plausible inputs in extreme cases — bariatric and
-- end-stage CHF patients can present above 700. 1000 is the new
-- sanity ceiling.
--
-- Pre-launch, zero customers — direct constraint replacement is safe.

alter table public.daily_log_readings
  drop constraint if exists daily_log_readings_check;

alter table public.daily_log_readings
  add constraint daily_log_readings_check check (
    (field = 'weight_lb'    and value >= 50 and value <= 1000) or
    (field = 'resting_hr'   and value >= 30 and value <= 220) or
    (field = 'spo2'         and value >= 50 and value <= 100) or
    (field = 'systolic_bp'  and value >= 60 and value <= 250) or
    (field = 'diastolic_bp' and value >= 30 and value <= 150)
  );
