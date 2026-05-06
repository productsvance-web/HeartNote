-- Add NDC column to medications.
--
-- Populated by the photo-scan flow when a US prescription label carries
-- an NDC (most do). The wizard's manual-entry path leaves NDC NULL.
-- Persisting NDC enables future re-scan deduplication and refill-link
-- features.
--
-- Pre-launch — no backfill, no compatibility shim.
--
-- RLS: existing patient_id policies on medications already scope this
-- column; adding a column does not alter row-level access.

alter table public.medications
  add column ndc text;
