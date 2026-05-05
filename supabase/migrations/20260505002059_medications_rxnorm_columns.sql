-- Add RxNorm-derived columns to medications.
--
-- The wizard at /me/medications/new resolves a typed drug name to a
-- canonical RxNorm concept (rxcui) and pulls the dose form + generic
-- ingredient from RxNav. Persisting all three preserves what the user
-- actually picked so future code (edit page, dose-change detection,
-- alert reasoning) doesn't have to re-resolve from the display name.
--
-- All three columns are nullable: the custom path (no RxNorm match)
-- inserts NULL for everything; rows added before this migration also
-- read NULL. Pre-launch — no backfill, no compatibility shim.
--
-- RLS: existing patient_id policies on medications already scope these
-- columns; adding a column does not alter row-level access.

alter table public.medications
  add column rxcui text,
  add column form text,
  add column ingredient text;
