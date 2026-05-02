-- Medication flow v1.1: dose-unit validation + inline event undo.
-- Companion to 20260501231211_medications_v1.sql; addresses preview-test gaps.

-- 1. allowed_strengths from RxNorm — populated at add-med time by
--    classifyDrugByName. Shape: { unit: 'MG', values: [10, 25] }.
--    Null means "not classified or RxNorm had no data" — caregiver can enter
--    any unit. When set, server validates dose's unit class strictly.
alter table public.medications
  add column allowed_strengths jsonb;

-- 2. Extend the adherence RPC to also return today's events. Lets the
--    dashboard card render an inline "Today's doses" list with per-event
--    delete affordance (replacing the absent undo flow).
--    Postgres won't change a function's return type via CREATE OR REPLACE,
--    so drop the v1 signature first.
drop function if exists public.medication_adherence_for_day(uuid, date, text);

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
  taken_today int,
  events jsonb
) as $$
  select
    m.id,
    m.drug_name,
    m.drug_class,
    m.doses_per_day,
    m.schedule_times,
    count(e.id) filter (where e.status in ('taken','early','late','double_dosed'))::int as taken_today,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'status', e.status,
          'actual_taken_at', e.actual_taken_at,
          'notes', e.notes
        )
        order by e.actual_taken_at desc
      ) filter (where e.id is not null),
      '[]'::jsonb
    ) as events
  from public.medications m
  left join public.medication_events e
    on e.medication_id = m.id
    and (e.actual_taken_at at time zone p_tz)::date = p_date
  where m.patient_id = p_patient_id
    and m.stopped_at is null
  group by m.id, m.drug_name, m.drug_class, m.doses_per_day, m.schedule_times
  order by m.drug_class, m.drug_name;
$$ language sql stable security invoker;
