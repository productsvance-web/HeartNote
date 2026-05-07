-- Phase 1 prereq: postural-dizziness qualifier
--
-- Closes the orthostatic-vs-persistent dizziness gap so the Phase 1 alert
-- engine can fire two different rules:
--   - tier 3 ("call cardiologist within 48 hrs") on brief on-standing dizziness
--   - tier 2 ("call cardiologist today") when dizziness coexists with low SBP
-- Today's binary `dizziness` symptom can't tell those apart.
--
-- Citation: research/chf-source-of-truth.md §2 Tier 2 ("SBP <90 with
-- dizziness/confusion/cool clammy") and §2 Tier 3 ("Brief orthostatic
-- dizziness (<1 min, no fall)").
--
-- Design: NULL allowed (no postural cue from caregiver → don't guess);
-- DB-enforced dizziness-only via CHECK so the engine can trust the field.
-- Mirrors the resolves_overnight (swelling-only) pattern from Phase 0.
--
-- Pre-launch, zero customers. No data preservation.

-- ─── 1. Add postural column ─────────────────────────────────────────────────

alter table public.daily_log_symptom_events
  add column postural boolean;

alter table public.daily_log_symptom_events
  add constraint daily_log_symptom_events_postural_dizziness_only
  check (postural is null or symptom = 'dizziness');

comment on column public.daily_log_symptom_events.postural is
  'For dizziness events only: was it on standing (true) or persistent / not '
  'specified-as-on-standing (false)? Phase 1 alert engine reads this to '
  'distinguish tier-3 orthostatic dizziness from tier-2 persistent. NULL '
  'when caregiver gave no postural cue. Cited: research/chf-source-of-truth.md '
  '§2 Tier 2 and Tier 3.';

-- ─── 2. Update apply_voice_log_extraction to write postural ─────────────────
--
-- Function signature unchanged: (uuid, jsonb, jsonb, jsonb). The new field
-- goes inside p_symptom_events[].postural.

create or replace function public.apply_voice_log_extraction(
  p_log_id uuid,
  p_readings jsonb,
  p_symptom_events jsonb,
  p_day_level jsonb
) returns void
language plpgsql
security invoker
as $$
declare
  v_patient_id uuid;
  v_log_date date;
begin
  select patient_id, log_date into strict v_patient_id, v_log_date
  from public.daily_logs
  where id = p_log_id;

  if jsonb_array_length(coalesce(p_readings, '[]'::jsonb)) > 0 then
    insert into public.daily_log_readings (
      patient_id, log_date, field, value, source_log_id
    )
    select v_patient_id,
           v_log_date,
           (r->>'field')::text,
           (r->>'value')::numeric,
           p_log_id
    from jsonb_array_elements(p_readings) as r;
  end if;

  if jsonb_array_length(coalesce(p_symptom_events, '[]'::jsonb)) > 0 then
    insert into public.daily_log_symptom_events (
      patient_id, log_date, symptom, present, severity, body_region,
      nocturnal, sputum_color, chest_pain_character, resolves_overnight,
      postural, source_log_id
    )
    select v_patient_id,
           v_log_date,
           (e->>'symptom')::text,
           (e->>'present')::boolean,
           nullif(e->>'severity','')::smallint,
           nullif(e->>'body_region',''),
           nullif(e->>'nocturnal','')::boolean,
           nullif(e->>'sputum_color',''),
           nullif(e->>'chest_pain_character',''),
           nullif(e->>'resolves_overnight','')::boolean,
           nullif(e->>'postural','')::boolean,
           p_log_id
    from jsonb_array_elements(p_symptom_events) as e;
  end if;

  update public.daily_logs
  set
    pillow_count             = coalesce((p_day_level->>'pillow_count')::smallint,             pillow_count),
    appetite_change          = coalesce(nullif(p_day_level->>'appetite_change',''),           appetite_change),
    urine_output_change      = coalesce(nullif(p_day_level->>'urine_output_change',''),       urine_output_change),
    activity_tolerance_change= coalesce(nullif(p_day_level->>'activity_tolerance_change',''), activity_tolerance_change),
    activity_step_change     = coalesce(nullif(p_day_level->>'activity_step_change',''),      activity_step_change)
  where id = p_log_id;
end;
$$;
