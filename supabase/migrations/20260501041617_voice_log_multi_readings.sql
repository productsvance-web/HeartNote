-- Voice log: multi-readings + symptom events
--
-- Today's model: one daily_logs row per (patient, day). Second dictation
-- overwrites the first via upsert, losing all prior values.
--
-- New model:
--  - Each dictation = its own daily_logs row (drop the UNIQUE constraint).
--  - Time-varying vitals move to daily_log_readings (append-only).
--  - Time-varying symptoms move to daily_log_symptom_events (append-only).
--  - Day-level summary fields (pillows, appetite, urine output, activity
--    tolerance) stay on daily_logs, set sparsely per dictation; "current"
--    value for a day is "latest non-null" via SELECT.
--
-- Pre-launch, zero customers. No data preservation; we drop columns directly.

-- ─── 1. New tables ──────────────────────────────────────────────────────────

create table public.daily_log_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  log_date date not null,
  recorded_at timestamptz not null default now(),
  field text not null check (field in (
    'weight_lb','resting_hr','spo2','systolic_bp','diastolic_bp'
  )),
  value numeric not null,
  -- Per-field range CHECKs as backstop. Primary validation is Zod in
  -- src/lib/voice-log/process.ts; this catches bugs that bypass it.
  check (
    (field = 'weight_lb' and value >= 50 and value <= 700) or
    (field = 'resting_hr' and value >= 30 and value <= 220) or
    (field = 'spo2' and value >= 50 and value <= 100) or
    (field = 'systolic_bp' and value >= 60 and value <= 250) or
    (field = 'diastolic_bp' and value >= 30 and value <= 150)
  ),
  source_log_id uuid references public.daily_logs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index daily_log_readings_patient_field_recent_idx
  on public.daily_log_readings(patient_id, field, recorded_at desc);
create index daily_log_readings_patient_date_idx
  on public.daily_log_readings(patient_id, log_date desc);

alter table public.daily_log_readings enable row level security;

create policy "caregiver crud own readings" on public.daily_log_readings
  for all using (
    exists (select 1 from public.patients p
            where p.id = daily_log_readings.patient_id
              and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p
            where p.id = daily_log_readings.patient_id
              and p.caregiver_id = auth.uid())
  );

create table public.daily_log_symptom_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  log_date date not null,
  recorded_at timestamptz not null default now(),
  symptom text not null check (symptom in (
    'dyspnea','cough','chest_pain','swelling','fatigue','pnd','syncope',
    'cognition_change','extremities_cold_clammy','cyanosis','early_satiety'
  )),
  present boolean not null,
  severity smallint check (severity is null or (severity between 0 and 4)),
  body_region text,
  sputum_color text check (
    sputum_color is null or sputum_color in ('clear','white','pink_frothy')
  ),
  chest_pain_character text,
  source_log_id uuid references public.daily_logs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index daily_log_symptom_events_patient_symptom_recent_idx
  on public.daily_log_symptom_events(patient_id, symptom, recorded_at desc);
create index daily_log_symptom_events_patient_date_idx
  on public.daily_log_symptom_events(patient_id, log_date desc);

alter table public.daily_log_symptom_events enable row level security;

create policy "caregiver crud own symptom events" on public.daily_log_symptom_events
  for all using (
    exists (select 1 from public.patients p
            where p.id = daily_log_symptom_events.patient_id
              and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p
            where p.id = daily_log_symptom_events.patient_id
              and p.caregiver_id = auth.uid())
  );

-- ─── 2. Drop UNIQUE on daily_logs(patient_id, log_date) ─────────────────────
--
-- Each dictation now creates its own daily_logs row. Multiple rows per day.
-- "Current" day-level value = latest non-null via SELECT.
--
-- Side note: alerts.daily_log_id (FK to daily_logs) now points at a specific
-- dictation rather than "the day's row." Alert engine isn't built yet — when
-- it is, the engine author should consider whether to attach alerts to
-- specific dictations or aggregate at the day level.

alter table public.daily_logs
  drop constraint if exists daily_logs_patient_id_log_date_key;

-- ─── 3. Drop columns from daily_logs (now event-tracked elsewhere) ──────────

alter table public.daily_logs
  drop column if exists weight_lb,
  drop column if exists systolic_bp,
  drop column if exists diastolic_bp,
  drop column if exists resting_hr,
  drop column if exists spo2,
  drop column if exists feeling_score,
  drop column if exists dyspnea_level,
  drop column if exists pnd_episode,
  drop column if exists cough_present,
  drop column if exists cough_nocturnal,
  drop column if exists sputum_color,
  drop column if exists swelling_severity,
  drop column if exists extremities_cold_clammy,
  drop column if exists cyanosis,
  drop column if exists chest_pain,
  drop column if exists chest_pain_character,
  drop column if exists syncope,
  drop column if exists early_satiety,
  drop column if exists fatigue_level,
  drop column if exists cognition_change;

-- ─── 4. RPC: atomic 3-table insert from voice-log extraction ────────────────
--
-- Supabase JS client cannot do client-side multi-statement transactions.
-- This SECURITY INVOKER function bundles all writes from one Claude
-- extraction into one atomic call. RLS still applies as the caller's
-- identity (no privilege escalation).
--
-- Inputs are JSON arrays/objects; we type them inside the function for
-- safety. Postgres aborts the whole function on any error, so partial
-- writes are impossible.

create or replace function public.apply_voice_log_extraction(
  p_log_id uuid,
  p_readings jsonb,        -- [{field, value}]
  p_symptom_events jsonb,  -- [{symptom, present, severity?, body_region?, sputum_color?, chest_pain_character?}]
  p_day_level jsonb        -- {pillow_count?, appetite_change?, urine_output_change?, activity_tolerance_change?}
) returns void
language plpgsql
security invoker
as $$
declare
  v_patient_id uuid;
  v_log_date date;
begin
  -- Find the parent log row + ownership context. RLS enforces caregiver
  -- ownership; if the caller can't see the row, this raises NO_DATA_FOUND.
  select patient_id, log_date into strict v_patient_id, v_log_date
  from public.daily_logs
  where id = p_log_id;

  -- Readings
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

  -- Symptom events
  if jsonb_array_length(coalesce(p_symptom_events, '[]'::jsonb)) > 0 then
    insert into public.daily_log_symptom_events (
      patient_id, log_date, symptom, present, severity, body_region,
      sputum_color, chest_pain_character, source_log_id
    )
    select v_patient_id,
           v_log_date,
           (e->>'symptom')::text,
           (e->>'present')::boolean,
           nullif(e->>'severity','')::smallint,
           nullif(e->>'body_region',''),
           nullif(e->>'sputum_color',''),
           nullif(e->>'chest_pain_character',''),
           p_log_id
    from jsonb_array_elements(p_symptom_events) as e;
  end if;

  -- Day-level fields on daily_logs (sparse update — only fields the caregiver
  -- mentioned in this dictation get set; nulls remain null)
  update public.daily_logs
  set
    pillow_count             = coalesce((p_day_level->>'pillow_count')::smallint,             pillow_count),
    appetite_change          = coalesce(nullif(p_day_level->>'appetite_change',''),           appetite_change),
    urine_output_change      = coalesce(nullif(p_day_level->>'urine_output_change',''),       urine_output_change),
    activity_tolerance_change= coalesce(nullif(p_day_level->>'activity_tolerance_change',''), activity_tolerance_change)
  where id = p_log_id;
end;
$$;

grant execute on function public.apply_voice_log_extraction(uuid, jsonb, jsonb, jsonb) to authenticated;
