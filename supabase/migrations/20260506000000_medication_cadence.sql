-- HeartNote medication schedule + cadence v1
-- Plan: docs/plans/medications-schedule-cadence-v1.md
--
-- Replaces the unused schedule_times/pills_per_dose/doses_per_day columns
-- on medications with a structured per-time table (medication_dose_times)
-- and adds cadence-kind metadata that drives Apple-Health-style scheduling
-- (every_day / cyclical / specific_days / every_few_days / as_needed).
--
-- The medication_adherence_for_day RPC now computes doses_per_day per-day
-- (cadence-aware), so dashboard / TodaysMedsList / TodaysMedsCard read a
-- single source of truth: "doses scheduled for THIS date" rather than a
-- denormalized count on the medications row.
--
-- Atomicity: a new save_medication_with_dose_times() function wraps the
-- medications upsert + dose-times replace in one transaction. Supabase JS
-- has no multi-statement transactions; this is the only correct shape.

-- ============================================================================
-- 1. Drop the legacy columns. The old check constraint on schedule_times
--    references doses_per_day, so order matters: drop schedule_times before
--    doses_per_day or use CASCADE. Inline checks drop with the column.
-- ============================================================================

alter table public.medications drop column schedule_times;
alter table public.medications drop column doses_per_day;
alter table public.medications drop column pills_per_dose;

-- ============================================================================
-- 2. Cadence metadata on medications.
--    Cross-column invariants (cyclical needs both cycle counts; every_few_days
--    needs interval_days; both need started_at) are enforced in actions.ts
--    Zod refinement — Postgres CHECK can't reach started_at cleanly here.
-- ============================================================================

alter table public.medications
  add column cadence_kind text not null default 'every_day'
    check (cadence_kind in ('every_day','cyclical','specific_days','every_few_days','as_needed')),
  add column cycle_on_days int
    check (cycle_on_days is null or cycle_on_days between 1 and 365),
  add column cycle_off_days int
    check (cycle_off_days is null or cycle_off_days between 1 and 365),
  add column interval_days int
    check (interval_days is null or interval_days between 2 and 30);

-- ============================================================================
-- 3. medication_dose_times — one row per (time-of-day, quantity) pair.
--    For specific_days cadence, applies_to_dow is a bitmap (Sun=1, Mon=2, ..,
--    Sat=64; range 1..127). For other cadences applies_to_dow is NULL.
-- ============================================================================

create table public.medication_dose_times (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  time_of_day text not null
    check (time_of_day ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  quantity numeric not null
    check (quantity > 0),
  ordinal smallint not null,
  applies_to_dow smallint
    check (applies_to_dow is null or applies_to_dow between 1 and 127),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medication_id, ordinal)
);

create index medication_dose_times_med_idx
  on public.medication_dose_times(medication_id, ordinal);

alter table public.medication_dose_times enable row level security;

create policy "caregiver crud own med dose times" on public.medication_dose_times
  for all using (
    exists (
      select 1 from public.medications m
      join public.patients p on p.id = m.patient_id
      where m.id = medication_dose_times.medication_id
        and p.caregiver_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.medications m
      join public.patients p on p.id = m.patient_id
      where m.id = medication_dose_times.medication_id
        and p.caregiver_id = auth.uid()
    )
  );

-- ============================================================================
-- 4. medication_adherence_for_day — cadence-aware per-day computation.
--    The RPC now derives "what's due today" from medication_dose_times,
--    filtered by the cadence rules:
--      - every_day: all dose-times apply.
--      - specific_days: dose-times whose applies_to_dow bitmap matches the
--        date's day-of-week bit (Sun=bit-0, Mon=bit-1, etc.).
--      - cyclical: all dose-times apply when (date - started_at) modulo
--        (cycle_on_days + cycle_off_days) < cycle_on_days.
--      - every_few_days: all dose-times apply when (date - started_at) %
--        interval_days = 0.
--      - as_needed: doses_per_day returns NULL (preserves PRN signal that
--        downstream code branches on).
--
--    SLOT_CONSUMER_STATUSES filter mirrors src/lib/medications/evaluate.ts —
--    keep them in sync.
-- ============================================================================

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
with date_dow as (
  -- Postgres extract(dow) returns 0=Sunday..6=Saturday; bitmap convention
  -- is Sun=1<<0, Mon=1<<1, ..., Sat=1<<6.
  select (1 << extract(dow from p_date)::int)::int as dow_bit
),
due_today as (
  -- Per-cadence filter for which dose-times apply on p_date.
  select
    m.id as medication_id,
    m.drug_name,
    m.drug_class,
    m.cadence_kind,
    dt.time_of_day,
    dt.ordinal
  from public.medications m
  left join public.medication_dose_times dt
    on dt.medication_id = m.id
    and (
      -- every_day: always.
      (m.cadence_kind = 'every_day')
      -- specific_days: bitmap intersect.
      or (m.cadence_kind = 'specific_days'
          and (dt.applies_to_dow & (select dow_bit from date_dow)) <> 0)
      -- cyclical: (p_date - started_at) mod (on+off) < on.
      or (m.cadence_kind = 'cyclical'
          and m.started_at is not null
          and m.cycle_on_days is not null
          and m.cycle_off_days is not null
          and ((p_date - m.started_at) % (m.cycle_on_days + m.cycle_off_days))
              between 0 and (m.cycle_on_days - 1))
      -- every_few_days: (p_date - started_at) % interval = 0.
      or (m.cadence_kind = 'every_few_days'
          and m.started_at is not null
          and m.interval_days is not null
          and ((p_date - m.started_at) % m.interval_days) = 0
          and (p_date - m.started_at) >= 0)
    )
  where m.patient_id = p_patient_id
    and m.stopped_at is null
)
select
  m.id,
  m.drug_name,
  m.drug_class,
  -- as_needed → NULL (PRN signal). Otherwise count of dose-times due today.
  case
    when m.cadence_kind = 'as_needed' then null
    else (select count(*)::int from due_today d where d.medication_id = m.id and d.time_of_day is not null)
  end as doses_per_day,
  -- schedule_times: the time_of_day list for today (sorted asc).
  case
    when m.cadence_kind = 'as_needed' then null
    else coalesce(
      (select array_agg(d.time_of_day order by d.time_of_day asc)
         from due_today d
        where d.medication_id = m.id and d.time_of_day is not null),
      array[]::text[]
    )
  end as schedule_times,
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
group by m.id, m.drug_name, m.drug_class, m.cadence_kind
order by m.drug_class, m.drug_name;
$$ language sql stable security invoker;

-- ============================================================================
-- 5. save_medication_with_dose_times — atomic insert/update for medications
--    plus dose-times. Caller passes a jsonb payload; function validates
--    auth + RLS (SECURITY INVOKER), upserts medications, replaces dose-times.
--
--    Payload shape:
--      {
--        "medication_id": uuid | null,    -- null = insert; non-null = update
--        "patient_id": uuid,
--        "drug_name": text,
--        "drug_class": text,
--        "dose": text | null,
--        "started_at": date | null,
--        "stopped_at": date | null,
--        "notes": text | null,
--        "ndc": text | null,
--        "rxcui": text | null,
--        "ingredient": text | null,
--        "form": text | null,
--        "allowed_strengths": jsonb | null,
--        "cadence_kind": text,
--        "cycle_on_days": int | null,
--        "cycle_off_days": int | null,
--        "interval_days": int | null,
--        "dose_times": [
--          { "time_of_day": "HH:MM", "quantity": numeric, "ordinal": int,
--            "applies_to_dow": int | null }
--        ]
--      }
--
--    Returns the medication id.
-- ============================================================================

create or replace function public.save_medication_with_dose_times(
  payload jsonb
) returns uuid
language plpgsql
security invoker
as $$
declare
  v_med_id uuid;
  v_is_update boolean;
begin
  v_med_id := nullif(payload->>'medication_id', '')::uuid;
  v_is_update := v_med_id is not null;

  if v_is_update then
    update public.medications set
      drug_name = payload->>'drug_name',
      drug_class = (payload->>'drug_class')::med_class,
      dose = nullif(payload->>'dose', ''),
      started_at = nullif(payload->>'started_at', '')::date,
      stopped_at = nullif(payload->>'stopped_at', '')::date,
      notes = nullif(payload->>'notes', ''),
      ndc = nullif(payload->>'ndc', ''),
      rxcui = nullif(payload->>'rxcui', ''),
      ingredient = nullif(payload->>'ingredient', ''),
      form = nullif(payload->>'form', ''),
      allowed_strengths = case
        when payload ? 'allowed_strengths' and payload->'allowed_strengths' <> 'null'::jsonb
          then payload->'allowed_strengths'
        else null
      end,
      cadence_kind = payload->>'cadence_kind',
      cycle_on_days = nullif(payload->>'cycle_on_days', '')::int,
      cycle_off_days = nullif(payload->>'cycle_off_days', '')::int,
      interval_days = nullif(payload->>'interval_days', '')::int,
      updated_at = now()
    where id = v_med_id;

    -- RLS-filtered update: 0 rows means caregiver doesn't own the med.
    if not found then
      raise exception 'Medication not found or not owned by caregiver';
    end if;

    -- Replace dose-times for the med. Cascading delete handled by FK; here
    -- we explicitly replace because cadence_kind change can drop all rows
    -- (e.g., switching to as_needed) without an FK cascade event.
    delete from public.medication_dose_times where medication_id = v_med_id;
  else
    insert into public.medications (
      patient_id, drug_name, drug_class, dose, started_at, stopped_at, notes,
      ndc, rxcui, ingredient, form, allowed_strengths,
      cadence_kind, cycle_on_days, cycle_off_days, interval_days
    ) values (
      (payload->>'patient_id')::uuid,
      payload->>'drug_name',
      (payload->>'drug_class')::med_class,
      nullif(payload->>'dose', ''),
      nullif(payload->>'started_at', '')::date,
      nullif(payload->>'stopped_at', '')::date,
      nullif(payload->>'notes', ''),
      nullif(payload->>'ndc', ''),
      nullif(payload->>'rxcui', ''),
      nullif(payload->>'ingredient', ''),
      nullif(payload->>'form', ''),
      case
        when payload ? 'allowed_strengths' and payload->'allowed_strengths' <> 'null'::jsonb
          then payload->'allowed_strengths'
        else null
      end,
      payload->>'cadence_kind',
      nullif(payload->>'cycle_on_days', '')::int,
      nullif(payload->>'cycle_off_days', '')::int,
      nullif(payload->>'interval_days', '')::int
    )
    returning id into v_med_id;
  end if;

  -- Insert dose-times. as_needed cadence skips this (empty array).
  if jsonb_array_length(coalesce(payload->'dose_times', '[]'::jsonb)) > 0 then
    insert into public.medication_dose_times (
      medication_id, time_of_day, quantity, ordinal, applies_to_dow
    )
    select
      v_med_id,
      d->>'time_of_day',
      (d->>'quantity')::numeric,
      (d->>'ordinal')::smallint,
      nullif(d->>'applies_to_dow', '')::smallint
    from jsonb_array_elements(payload->'dose_times') d;
  end if;

  return v_med_id;
end;
$$;
