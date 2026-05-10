-- Fatigue severity unblocked
--
-- Drops the constraint that forced fatigue rows to omit severity. The
-- Phase 1 alert engine reads fatigue as binary-vs-baseline; this migration
-- unblocks the /log redesign UI from rendering a 4-level segmented control.
-- No engine behavior change.
--
-- Cited: research/chf-source-of-truth.md §2 Tier 3 — fatigue framed as a
-- frequency-of-presence signal; the new severity column is reserved for
-- future trend rules and modal richness, not engine logic.
--
-- Pre-launch, zero customers. The constraint added in
-- 20260506100000_phase_0_schema_gaps.sql:74-87 is dropped directly.

alter table public.daily_log_symptom_events
  drop constraint if exists daily_log_symptom_events_fatigue_no_severity;
