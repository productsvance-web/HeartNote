-- HeartNote medication flow v1
-- Adds scheduling shape to medications and allows dose confirmations without a clock schedule.
-- Plan: docs/plans/medication-flow-v1.md
--
-- Per-element HH:MM regex on schedule_times[] is enforced at the Zod boundary,
-- not in the CHECK constraint — Postgres CHECK constraints can't contain
-- subqueries, which a per-element regex on an array would require. The form
-- and server action validate format at the boundary (CLAUDE.md build conv #10).

-- 1. Doses per day. Null = PRN/as-needed; excluded from habit-row math.
alter table public.medications
  add column doses_per_day int
  check (doses_per_day is null or doses_per_day between 1 and 12);

-- 2. Optional clock-time schedule. Only set when caregiver knows the times.
--    Count must match doses_per_day when both are set.
alter table public.medications
  add column schedule_times text[]
  check (
    schedule_times is null
    or array_length(schedule_times, 1) = doses_per_day
  );

-- 3. Confirmations without a clock schedule are valid: scheduled_at can be null.
alter table public.medication_events
  alter column scheduled_at drop not null;

-- 4. Index for adherence math. actual_taken_at is the calendar-day anchor
--    (the time the dose was actually taken, not when the row was logged) —
--    see plan "Architectural decisions" #6.
create index medication_events_taken_idx
  on public.medication_events(patient_id, medication_id, actual_taken_at desc)
  where status in ('taken','early','late','double_dosed');

-- 5. Adherence aggregation for one calendar day in the patient's timezone.
--    One round-trip for the dashboard card AND (in PR 2) the habit tile.
--    SECURITY INVOKER so RLS on medications + medication_events still applies.
--    Returns active meds only; doses_per_day = null marks PRN (caller decides
--    how to display).
create or replace function public.medication_adherence_for_day(
  p_patient_id uuid,
  p_date date,
  p_tz text
) returns table(
  medication_id uuid,
  drug_name text,
  drug_class med_class,
  doses_per_day int,
  schedule_times text[],
  taken_today int
) as $$
  select
    m.id,
    m.drug_name,
    m.drug_class,
    m.doses_per_day,
    m.schedule_times,
    count(e.id) filter (where e.status in ('taken','early','late','double_dosed'))::int as taken_today
  from public.medications m
  left join public.medication_events e
    on e.medication_id = m.id
    and (e.actual_taken_at at time zone p_tz)::date = p_date
  where m.patient_id = p_patient_id
    and m.stopped_at is null
  group by m.id, m.drug_name, m.drug_class, m.doses_per_day, m.schedule_times
  order by m.drug_class, m.drug_name;
$$ language sql stable security invoker;
