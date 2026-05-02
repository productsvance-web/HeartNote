-- Drop the unused `frequency` column from medications.
--
-- Was free-text ("every morning") with no consumer — voice extraction and
-- the dashboard adherence path both ignore it. doses_per_day + schedule_times
-- carry the structured frequency information. Dropping per CLAUDE.md
-- "no half-finished implementations" — a captured-but-never-read field is
-- a half-finished surface.
--
-- A future course-tracking PR (see plan §non-goals) may add structured
-- fields like course_days for short-course meds (antibiotics).

alter table public.medications drop column frequency;
