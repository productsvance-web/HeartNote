-- Phase 1: daily_assessments table
--
-- Per-day rollup of the rules-only alert engine's verdict. One row per
-- (patient, log_date), upserted on every dictation. The home screen reads
-- this row to answer "is anything different today?" without ever
-- recomputing client-side (per .claude/rules/code-quality.md rule #3).
--
-- Distinct from the existing `alerts` table on purpose:
--   alerts          = actionable notification with cardiologist_script,
--                     ai_reasoning, acknowledged_at, action_taken (lifecycle).
--                     Populated by the v0.5 LLM-reasoning layer; one row per
--                     fired alert; can be 0..N per (patient, day).
--   daily_assessments = the rules-only verdict for a day. One row per
--                     (patient, date). Drives the home screen, push
--                     notifications, and trend cards. v0 writes this only.
--
-- Pre-launch, zero customers. No data preservation.

create table public.daily_assessments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  log_date date not null,
  tier alert_tier not null,
  -- jsonb array of {rule_id, label, evidence}. Empty array when tier_4_log
  -- (steady or cold-start) — never null so consumers can iterate without
  -- an extra null check.
  triggers jsonb not null default '[]'::jsonb,
  cold_start boolean not null,
  source_log_id uuid references public.daily_logs(id) on delete set null,
  evaluated_at timestamptz not null default now(),
  unique (patient_id, log_date)
);

create index daily_assessments_patient_date_idx
  on public.daily_assessments(patient_id, log_date desc);

alter table public.daily_assessments enable row level security;

create policy "caregiver crud own assessments" on public.daily_assessments
  for all using (
    exists (select 1 from public.patients p
            where p.id = daily_assessments.patient_id
              and p.caregiver_id = auth.uid())
  ) with check (
    exists (select 1 from public.patients p
            where p.id = daily_assessments.patient_id
              and p.caregiver_id = auth.uid())
  );

comment on table public.daily_assessments is
  'Rules-only alert engine verdict per (patient, day). Drives the home '
  'screen. Distinct from `alerts` (which is the LLM-layer notification with '
  'cardiologist_script and action lifecycle, populated in v0.5).';
comment on column public.daily_assessments.triggers is
  'Array of {rule_id, label, evidence} objects. rule_id like "T2.1"; label '
  'is plain-English caregiver copy; evidence is the rule''s structured '
  'inputs (numbers, dates) for trend display and visit reports. Empty [] '
  'on tier_4_log.';
comment on column public.daily_assessments.cold_start is
  'true when the patient has fewer than 7 logs in the prior 14 days, in '
  'which case weight-trend and frequency-baseline rules are suppressed but '
  'acute single-event rules (Tier 1, symptom-only Tier 2/3) still fire.';
comment on column public.daily_assessments.source_log_id is
  'The latest dictation that triggered re-evaluation. Lossy on multi-'
  'dictation days — the assessment reads ALL of the day''s data, not just '
  'this dictation''s.';
