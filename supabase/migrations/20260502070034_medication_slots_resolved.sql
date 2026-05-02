-- Adherence RPC: rename `taken_today` -> `slots_resolved`, change semantic.
--
-- `slots_resolved` counts today's events whose status RESOLVES a dose slot
-- (any terminal status; `double_dosed` is "extra" and does NOT consume a slot).
-- This is the count the dashboard renders as the numerator (e.g. "1/1") and
-- the predicate the slot-mute UI uses for non-PRN meds.
--
-- IMPORTANT: this filter must stay in sync with `SLOT_CONSUMER_STATUSES`
-- in src/lib/medications/evaluate.ts. If the enum gains a new terminal
-- status, update both.
--
-- NOT adherence math. Visit reports / trend detection compute adherence
-- from medication_events directly with status-aware logic — "1/1 resolved"
-- can mean taken, refused, or missed, and downstream consumers must
-- distinguish. The label here is "resolved," not "taken."
--
-- Postgres won't change a function's return type via CREATE OR REPLACE,
-- so drop the prior signature first.

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
  slots_resolved int,
  events jsonb
) as $$
  select
    m.id,
    m.drug_name,
    m.drug_class,
    m.doses_per_day,
    m.schedule_times,
    -- Slot consumers: any terminal status except `double_dosed` (extra).
    -- Mirror of SLOT_CONSUMER_STATUSES in src/lib/medications/evaluate.ts.
    count(e.id) filter (where e.status <> 'double_dosed')::int as slots_resolved,
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
    -- Date filter requires non-null actual_taken_at. Both writers
    -- (confirmDose, voice-log process.ts) set it on every insert.
    and (e.actual_taken_at at time zone p_tz)::date = p_date
  where m.patient_id = p_patient_id
    and m.stopped_at is null
  group by m.id, m.drug_name, m.drug_class, m.doses_per_day, m.schedule_times
  order by m.drug_class, m.drug_name;
$$ language sql stable security invoker;
