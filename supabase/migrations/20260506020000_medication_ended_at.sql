-- Add planned-end date to medications.
--
-- `ended_at` is the prescriber's planned schedule end (e.g., a 10-day
-- antibiotic course). Distinct from `stopped_at`, which the caregiver
-- sets via the "Stop taking this" button when actually stopping. End
-- date is a planning artifact set on the schedule editor.
--
-- This migration:
--   1. Adds the `ended_at date null` column.
--   2. Replaces `save_medication_with_dose_times` to read/write
--      `ended_at` from the payload alongside `started_at`.
--
-- NOTE: `medication_adherence_for_day` is not updated in this migration.
-- A med with a past `ended_at` will continue to fire scheduled
-- notifications until the caregiver explicitly stops it. Filtering the
-- adherence RPC on `ended_at` is a follow-up — flagged so it doesn't
-- ship as silent dead state.

alter table public.medications
  add column if not exists ended_at date null;

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
      ended_at = nullif(payload->>'ended_at', '')::date,
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

    if not found then
      raise exception 'Medication not found or not owned by caregiver';
    end if;

    delete from public.medication_dose_times where medication_id = v_med_id;
  else
    insert into public.medications (
      patient_id, drug_name, drug_class, dose, started_at, ended_at,
      stopped_at, notes,
      ndc, rxcui, ingredient, form, allowed_strengths,
      cadence_kind, cycle_on_days, cycle_off_days, interval_days
    ) values (
      (payload->>'patient_id')::uuid,
      payload->>'drug_name',
      (payload->>'drug_class')::med_class,
      nullif(payload->>'dose', ''),
      nullif(payload->>'started_at', '')::date,
      nullif(payload->>'ended_at', '')::date,
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
    from jsonb_array_elements(payload->'dose_times') as d;
  end if;

  return v_med_id;
end;
$$;
