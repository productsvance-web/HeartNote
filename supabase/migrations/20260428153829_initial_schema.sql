-- HeartNote initial schema
-- Caregiver-pointed data model: caregiver (auth.users) -> patients -> daily_logs / alerts / medications / cardiology_visits / family_shares
-- Every user-data table has RLS enabled with policies. Schema decisions anchored in research/chf-source-of-truth.md.

-- ============================================================================
-- ENUMS
-- ============================================================================

create type alert_tier as enum ('tier_1_911', 'tier_2_today', 'tier_3_48hr', 'tier_4_log');
create type alert_action as enum ('called_doctor', 'went_to_er', 'scheduled_appt', 'ignored', 'false_alarm');
create type med_class as enum (
  'loop_diuretic',
  'ace_inhibitor',
  'arb',
  'arni',
  'beta_blocker',
  'mra',
  'sglt2_inhibitor',
  'digoxin',
  'antiarrhythmic',
  'anticoagulant_warfarin',
  'anticoagulant_doac',
  'potassium_supplement',
  'other'
);
create type nyha_class as enum ('I', 'II', 'III', 'IV', 'unknown');

-- ============================================================================
-- PROFILES (1:1 with auth.users)
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'America/New_York',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users read own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id);

-- ============================================================================
-- PATIENTS (the parent being cared for; not an auth user)
-- ============================================================================

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  caregiver_id uuid not null references public.profiles(id) on delete cascade,
  display_name text not null,
  relationship text,
  date_of_birth date,
  dry_weight_lb numeric(5,1),
  nyha_class nyha_class default 'unknown',
  cardiologist_name text,
  cardiologist_phone text,
  primary_conditions text[] default array['CHF']::text[],
  known_allergies text[],
  -- Per-patient baselines so the AI computes deviation from THIS patient's normal,
  -- not population thresholds. Set during onboarding; rarely changed.
  baseline_sbp_low smallint,
  baseline_sbp_high smallint,
  baseline_dbp_low smallint,
  baseline_dbp_high smallint,
  baseline_resting_hr_low smallint,
  baseline_resting_hr_high smallint,
  normal_pillow_count smallint default 1,
  normal_active_minutes_per_day smallint,
  hf_hospitalization_count smallint not null default 0,
  last_hf_hospitalization_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index patients_caregiver_id_idx on public.patients(caregiver_id);

alter table public.patients enable row level security;

create policy "caregiver crud own patients" on public.patients
  for all using (auth.uid() = caregiver_id) with check (auth.uid() = caregiver_id);

-- ============================================================================
-- DAILY LOGS (one per patient per day)
-- ============================================================================

-- daily_logs structured columns are the fields the tier-detection logic reads on every
-- alert evaluation. Promoted from JSONB for fast indexed querying. Lower-frequency or
-- exploratory observations live in structured_observations (jsonb) — Claude writes against
-- a strict TS contract defined at src/lib/voice-log/schema.ts.
create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  log_date date not null,

  -- Vitals
  weight_lb numeric(5,1),
  systolic_bp smallint,
  diastolic_bp smallint,
  resting_hr smallint,
  spo2 smallint,

  -- Subjective baseline
  feeling_score smallint check (feeling_score between 1 and 5),

  -- Respiratory (tier-1 trip lines)
  dyspnea_level smallint check (dyspnea_level between 0 and 4), -- 4 = at rest, can't finish sentences
  pillow_count smallint,
  pnd_episode boolean default false,
  cough_present boolean default false,
  cough_nocturnal boolean default false,
  sputum_color text check (sputum_color in ('clear','white','pink_frothy') or sputum_color is null),

  -- Circulatory
  swelling_severity smallint check (swelling_severity between 0 and 4),
  extremities_cold_clammy boolean default false,
  cyanosis boolean default false,

  -- Acute neurological (tier-1 trip lines)
  chest_pain boolean default false,
  chest_pain_character text,
  syncope boolean default false,

  -- Constitutional / GI / urinary
  appetite_change text check (appetite_change in ('decreased','unchanged','increased') or appetite_change is null),
  early_satiety boolean default false,
  fatigue_level smallint check (fatigue_level between 0 and 4),
  urine_output_change text check (urine_output_change in ('decreased','unchanged','increased') or urine_output_change is null),

  -- Cognitive / mood (mild = tier 2, severe = tier 1)
  cognition_change text check (cognition_change in ('none','mild_fog','confusion','severe') or cognition_change is null),

  -- Activity tolerance (NYHA creep) — caregiver phrase, e.g. "stopped halfway up stairs"
  activity_tolerance_change text,

  -- Voice + AI
  transcribed_text text,
  structured_observations jsonb,
  audio_storage_path text,
  ai_processed_at timestamptz,
  whisper_confidence numeric(3,2),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, log_date)
);

create index daily_logs_patient_date_idx on public.daily_logs(patient_id, log_date desc);

alter table public.daily_logs enable row level security;

create policy "caregiver crud own logs" on public.daily_logs
  for all using (
    exists (select 1 from public.patients p where p.id = daily_logs.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = daily_logs.patient_id and p.caregiver_id = auth.uid())
  );

-- ============================================================================
-- ALERTS (red-alert events triggered by AI threshold logic)
-- ============================================================================

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  daily_log_id uuid references public.daily_logs(id) on delete set null,
  tier alert_tier not null,
  trigger_reason text not null,
  trigger_data jsonb,
  ai_reasoning text,
  cardiologist_script text,
  acknowledged_at timestamptz,
  action_taken alert_action,
  action_notes text,
  created_at timestamptz not null default now()
);

create index alerts_patient_created_idx on public.alerts(patient_id, created_at desc);
create index alerts_unacknowledged_idx on public.alerts(patient_id, tier) where acknowledged_at is null;

alter table public.alerts enable row level security;

create policy "caregiver crud own alerts" on public.alerts
  for all using (
    exists (select 1 from public.patients p where p.id = alerts.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = alerts.patient_id and p.caregiver_id = auth.uid())
  );

-- ============================================================================
-- MEDICATIONS
-- ============================================================================

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  drug_name text not null,
  drug_class med_class not null default 'other',
  dose text,
  frequency text,
  started_at date,
  stopped_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index medications_patient_idx on public.medications(patient_id) where stopped_at is null;

alter table public.medications enable row level security;

create policy "caregiver crud own meds" on public.medications
  for all using (
    exists (select 1 from public.patients p where p.id = medications.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = medications.patient_id and p.caregiver_id = auth.uid())
  );

-- ============================================================================
-- MEDICATION EVENTS (one row per scheduled dose — adherence is critical signal)
-- Without this table, the "missed diuretic" decompensation pattern is invisible.
-- ============================================================================

create type med_event_status as enum ('taken','missed','double_dosed','refused','early','late');

create table public.medication_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  medication_id uuid not null references public.medications(id) on delete cascade,
  scheduled_at timestamptz not null,
  status med_event_status not null,
  actual_taken_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index med_events_patient_scheduled_idx
  on public.medication_events(patient_id, scheduled_at desc);
create index med_events_missed_idx
  on public.medication_events(patient_id) where status = 'missed';

alter table public.medication_events enable row level security;

create policy "caregiver crud own med events" on public.medication_events
  for all using (
    exists (select 1 from public.patients p where p.id = medication_events.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = medication_events.patient_id and p.caregiver_id = auth.uid())
  );

-- ============================================================================
-- SIGNIFICANT EVENTS (discrete one-off events — not daily metrics)
-- Falls, ER visits, hospitalizations, chest pain episodes. Each one shifts the
-- patient's risk profile.
-- ============================================================================

create type significant_event_type as enum (
  'fall',
  'er_visit',
  'hospitalization',
  'chest_pain_episode',
  'near_syncope',
  'syncope',
  'new_med_started',
  'med_stopped',
  'new_diagnosis',
  'cardiology_visit_unplanned',
  'home_visit_clinician',
  'other'
);

create table public.significant_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  event_type significant_event_type not null,
  event_date date not null,
  event_time time,
  description text,
  location text,
  resolved boolean default true,
  related_alert_id uuid references public.alerts(id) on delete set null,
  related_log_id uuid references public.daily_logs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sig_events_patient_date_idx
  on public.significant_events(patient_id, event_date desc);
create index sig_events_hospitalization_idx
  on public.significant_events(patient_id, event_date desc) where event_type = 'hospitalization';

alter table public.significant_events enable row level security;

create policy "caregiver crud own significant events" on public.significant_events
  for all using (
    exists (select 1 from public.patients p where p.id = significant_events.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = significant_events.patient_id and p.caregiver_id = auth.uid())
  );

-- ============================================================================
-- CARDIOLOGY VISITS (auto-generated reports + post-visit notes)
-- ============================================================================

create table public.cardiology_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  visit_date date not null,
  cardiologist_name text,
  visit_kind text,
  generated_report jsonb,
  generated_report_text text,
  questions_to_ask jsonb,
  notes_after text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cardiology_visits_patient_date_idx on public.cardiology_visits(patient_id, visit_date desc);

alter table public.cardiology_visits enable row level security;

create policy "caregiver crud own visits" on public.cardiology_visits
  for all using (
    exists (select 1 from public.patients p where p.id = cardiology_visits.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = cardiology_visits.patient_id and p.caregiver_id = auth.uid())
  );

-- ============================================================================
-- FAMILY SHARES (read-only links for siblings)
-- ============================================================================

create table public.family_shares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  share_token text not null unique default encode(gen_random_bytes(32), 'hex'),
  recipient_label text,
  recipient_email text,
  expires_at timestamptz,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index family_shares_token_idx on public.family_shares(share_token) where revoked_at is null;
create index family_shares_patient_idx on public.family_shares(patient_id);

alter table public.family_shares enable row level security;

create policy "caregiver crud own shares" on public.family_shares
  for all using (
    exists (select 1 from public.patients p where p.id = family_shares.patient_id and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p where p.id = family_shares.patient_id and p.caregiver_id = auth.uid())
  );

-- Public read by token (no auth required) — for the sibling who clicked the share link.
-- A separate API endpoint will validate share_token + expires_at + revoked_at and return a redacted view.
-- We do NOT add a public RLS policy here; the API will use the service role with explicit checks.

-- ============================================================================
-- TRIGGERS — auto-update updated_at
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger patients_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger daily_logs_updated_at before update on public.daily_logs
  for each row execute function public.set_updated_at();
create trigger medications_updated_at before update on public.medications
  for each row execute function public.set_updated_at();
create trigger cardiology_visits_updated_at before update on public.cardiology_visits
  for each row execute function public.set_updated_at();
create trigger significant_events_updated_at before update on public.significant_events
  for each row execute function public.set_updated_at();

-- ============================================================================
-- TRIGGER — auto-create profile on auth signup
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
