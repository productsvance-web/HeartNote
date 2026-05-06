-- Phase 0 schema gaps
--
-- Closes 6 gaps identified in the Phase 0 audit so the Phase 1 alert engine
-- can read clean inputs that match the clinical research. No alert logic
-- yet; this migration only widens the data model.
--
-- Citations: research/chf-source-of-truth.md §2 (tier definitions), §3
-- (numeric thresholds). Each gap below cites the exact section.
--
-- Pre-launch, zero customers. No data preservation; constraints can be
-- dropped and recreated freely.

-- ─── 1. Widen daily_log_symptom_events.symptom enum ──────────────────────────
--
-- New symptom values (all binary, no severity):
--   pulse_irregular  — research §2 Tier 1: "New fast irregular pulse with
--                      chest pain or dizziness". Caregiver phrase: "pulse
--                      felt skippy", "watch sent AFib alert".
--   dizziness        — research §2 Tier 2: "SBP <90 with dizziness".
--                      research §2 Tier 3: "Brief orthostatic dizziness
--                      (<1 min, no fall)". Two distinct rules need this.
--   nausea           — research §2 Tier 2: "New nausea / early satiety
--                      persisting >24 hr". Distinct from early_satiety
--                      because the research separates them.

alter table public.daily_log_symptom_events
  drop constraint daily_log_symptom_events_symptom_check;

alter table public.daily_log_symptom_events
  add constraint daily_log_symptom_events_symptom_check
  check (symptom in (
    'dyspnea','cough','chest_pain','swelling','fatigue','pnd','syncope',
    'cognition_change','extremities_cold_clammy','cyanosis','early_satiety',
    'pulse_irregular','dizziness','nausea'
  ));

-- ─── 2. Widen daily_log_symptom_events.sputum_color enum ─────────────────────
--
-- research §2 Tier 1: "Coughing up pink OR white frothy sputum" — both
-- colors are tier-1 cardiogenic-pulmonary-edema triggers. Schema previously
-- only had pink_frothy, missing the white_frothy variant.

alter table public.daily_log_symptom_events
  drop constraint daily_log_symptom_events_sputum_color_check;

alter table public.daily_log_symptom_events
  add constraint daily_log_symptom_events_sputum_color_check
  check (
    sputum_color is null or sputum_color in
      ('clear','white','pink_frothy','white_frothy')
  );

-- ─── 3. Add daily_log_symptom_events.resolves_overnight ──────────────────────
--
-- research §2 Tier 3: "Mild swelling that resolves with elevation overnight"
-- ("Ankles puff up in the evening but look normal by morning"). The
-- discriminator is the resolution, not the time-of-day — so we record one
-- boolean per swelling event rather than bucketing clock times.
--
-- DB-enforced swelling-only so the Phase 1 alert engine can trust the field.

alter table public.daily_log_symptom_events
  add column resolves_overnight boolean;

alter table public.daily_log_symptom_events
  add constraint daily_log_symptom_events_resolves_overnight_swelling_only
  check (resolves_overnight is null or symptom = 'swelling');

comment on column public.daily_log_symptom_events.resolves_overnight is
  'For swelling events only: was the swelling there last night (or evening) '
  'and gone by morning? Tier-3 evening-only-swelling rule reads this. '
  'Cited: research/chf-source-of-truth.md §2 Tier 3.';

-- ─── 4. Enforce fatigue-no-severity ──────────────────────────────────────────
--
-- The 0–4 severity scale was HeartNote''s invention; research §2 Tier 3
-- frames fatigue as a frequency-of-presence signal ("step-change in fatigue
-- / napping pattern"), not a daily severity level. The Phase 1 alert engine
-- will read fatigue as binary-present and fire on rolling-7-day-vs-baseline
-- frequency. Enforce at DB so prompt + extractor + DB are coherent.
--
-- The severity column itself stays — dyspnea, swelling, and cognition_change
-- still use 0–4 scales anchored to the research.

alter table public.daily_log_symptom_events
  add constraint daily_log_symptom_events_fatigue_no_severity
  check (severity is null or symptom <> 'fatigue');

-- ─── 5. Add daily_logs.activity_step_change ──────────────────────────────────
--
-- Cause-agnostic classification of functional change today. When a caregiver
-- says "she couldn''t get out of bed today," the cause could be fatigue,
-- swelling, breathing, weakness, or something we don''t have a word for —
-- forcing it into any single symptom''s severity scale assumes the cause.
-- This field captures the functional change regardless of cause; the cause
-- (if known) goes in symptom_events as usual.
--
-- Three values:
--   none          — caregiver explicitly said "she was fine" or equivalent
--   mild_slowdown — "a bit slower than usual" / "took her a while" — no
--                   inability described
--   severe_change — "couldn''t get out of bed" / "couldn''t make it to the
--                   bathroom on her own" / "needed help to sit up"
--
-- Coexists with activity_tolerance_change (free-text caregiver phrase). The
-- free-text field captures the verbatim phrase for visit reports; this
-- structured field is what alert rules read. Both are kept; neither is dead.
--
-- Citations: research §2 Tier 2 "Worsening dyspnea on exertion" (NYHA creep,
-- step-change in ADL tolerance), research §2 Tier 3 "step-change in fatigue
-- / napping pattern". The functional-change framing applies to both tiers.

alter table public.daily_logs
  add column activity_step_change text
  check (activity_step_change is null or activity_step_change in
    ('none','mild_slowdown','severe_change'));

comment on column public.daily_logs.activity_step_change is
  'Structured cause-agnostic classification of functional change today. '
  'Read by Phase 1 alert engine. Distinct from activity_tolerance_change '
  '(free-text verbatim caregiver phrase, used in visit reports). Both kept. '
  'Cited: research/chf-source-of-truth.md §2 Tier 2/Tier 3.';

-- ─── 6. Update apply_voice_log_extraction RPC ────────────────────────────────
--
-- Function signature unchanged: (uuid, jsonb, jsonb, jsonb). The two new
-- fields go inside existing jsonb args:
--   p_symptom_events[].resolves_overnight  → into daily_log_symptom_events
--   p_day_level.activity_step_change       → into daily_logs (sparse update)
--
-- CREATE OR REPLACE FUNCTION preserves the signature; only the body changes.
-- security invoker — RLS still applies as the caller''s identity.

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
      source_log_id
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
