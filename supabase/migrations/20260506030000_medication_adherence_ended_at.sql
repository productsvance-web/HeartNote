-- Wire `ended_at` into medication_adherence_for_day so a med stops
-- showing as "due today" past its planned end date. CREATE OR REPLACE
-- preserves the latest function body (post-RPC-symmetry patch in
-- 20260506010000_medication_cadence_rpc_symmetry.sql) and adds the
-- `ended_at` filter to BOTH WHERE clauses (the due_today CTE and the
-- outer SELECT).
--
-- Pairs with the JS-side filter in src/lib/medications/notifications.ts
-- which stops scheduling local notifications past `ended_at`.

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
  select (1 << extract(dow from p_date)::int)::int as dow_bit
),
due_today as (
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
      (m.cadence_kind = 'every_day')
      or (m.cadence_kind = 'specific_days'
          and (dt.applies_to_dow & (select dow_bit from date_dow)) <> 0)
      or (m.cadence_kind = 'cyclical'
          and m.started_at is not null
          and m.cycle_on_days is not null
          and m.cycle_off_days is not null
          and (p_date - m.started_at) >= 0
          and ((p_date - m.started_at) % (m.cycle_on_days + m.cycle_off_days))
              between 0 and (m.cycle_on_days - 1))
      or (m.cadence_kind = 'every_few_days'
          and m.started_at is not null
          and m.interval_days is not null
          and ((p_date - m.started_at) % m.interval_days) = 0
          and (p_date - m.started_at) >= 0)
    )
  where m.patient_id = p_patient_id
    and m.stopped_at is null
    and (m.ended_at is null or p_date <= m.ended_at)
)
select
  m.id,
  m.drug_name,
  m.drug_class,
  case
    when m.cadence_kind = 'as_needed' then null
    else (select count(*)::int from due_today d where d.medication_id = m.id and d.time_of_day is not null)
  end as doses_per_day,
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
  and (m.ended_at is null or p_date <= m.ended_at)
group by m.id, m.drug_name, m.drug_class, m.cadence_kind
order by m.drug_class, m.drug_name;
$$ language sql stable security invoker;
