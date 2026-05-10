-- /log redesign: tap-session column on daily_logs
--
-- Each open-of-/log creates one tap-session row when the caregiver taps a
-- vital or symptom; subsequent taps in the same session UPSERT into that
-- same row. Voice rows leave tap_session_id NULL (one row per dictation,
-- unchanged). The unique partial index keys the upsert cleanly so a race
-- between two debounced saves of the same session collides into UPDATE.
--
-- Pre-launch, zero customers. RLS policies on daily_logs already cover
-- caregiver-owns-patient, and column adds inherit row-level RLS.

alter table public.daily_logs
  add column if not exists tap_session_id uuid;

create index if not exists daily_logs_tap_session_idx
  on public.daily_logs(patient_id, log_date, tap_session_id)
  where tap_session_id is not null;

create unique index if not exists daily_logs_tap_session_uk
  on public.daily_logs(patient_id, log_date, tap_session_id)
  where tap_session_id is not null;
