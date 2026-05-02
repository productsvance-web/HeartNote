-- Drop the unused `'missed'` value from the `med_event_status` enum.
--
-- Pre-launch decision: there is no manual or voice-log path that emits
-- 'missed'. Absence of a logged event is the implicit signal across the
-- app — caregivers no longer record an explicit "missed" status anywhere.
-- The TS-side cleanup happens in the same commit (extract.ts, process.ts,
-- evaluate.ts, dashboard/actions.ts, TodaysMedsList.tsx).
--
-- Postgres has no `ALTER TYPE … DROP VALUE`, so we rename the existing
-- type, create a fresh one without 'missed', cast the column, and drop
-- the old type. This is destructive — only safe because:
--   1. No rows currently have status='missed' (asserted pre-migration).
--   2. The dependent function `medication_adherence_for_day` is dropped
--      and recreated identically (only the literal 'double_dosed'
--      reference needs to bind to the new type, which it will).

-- 1. Assert no rows have the dropped value. If this fires, the migration
--    aborts cleanly and the type change does not happen.
do $$
begin
  if exists (select 1 from public.medication_events where status = 'missed') then
    raise exception 'Cannot drop med_event_status.missed: rows exist with that status. Migrate or delete them first.';
  end if;
end $$;

-- 2. Drop the partial indexes whose WHERE clauses reference enum literals
--    (created in 20260428153829_initial_schema.sql and
--    20260501231211_medications_v1.sql). Postgres binds those literals to
--    the type at index-creation time; if we leave them in place, the
--    ALTER COLUMN USING cast in step 4 fails with "operator does not
--    exist: med_event_status = med_event_status_old."
drop index if exists public.med_events_missed_idx;
drop index if exists public.medication_events_taken_idx;

-- 3. Drop the function that depends on the enum column. Recreated below
--    with identical body — only the type binding changes.
drop function if exists public.medication_adherence_for_day(uuid, date, text);

-- 4. Rename → recreate → cast → drop.
alter type public.med_event_status rename to med_event_status_old;

create type public.med_event_status as enum (
  'taken','double_dosed','refused','early','late'
);

alter table public.medication_events
  alter column status type public.med_event_status
  using status::text::public.med_event_status;

drop type public.med_event_status_old;

-- 4b. Recreate the taken-events partial index that drove adherence math.
--     Same definition as 20260501231211_medications_v1.sql; only the
--     enum-literal type binding refreshes.
create index medication_events_taken_idx
  on public.medication_events(patient_id, medication_id, actual_taken_at desc)
  where status in ('taken','early','late','double_dosed');

-- 5. Recreate the adherence function. Body identical to the
--    20260502070034_medication_slots_resolved.sql migration; the rebind
--    happens automatically once the column points at the new type.
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
    and (e.actual_taken_at at time zone p_tz)::date = p_date
  where m.patient_id = p_patient_id
    and m.stopped_at is null
  group by m.id, m.drug_name, m.drug_class, m.doses_per_day, m.schedule_times
  order by m.drug_class, m.drug_name;
$$ language sql stable security invoker;
