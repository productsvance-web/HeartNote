-- Add pills_per_dose to medications.
--
-- Captures the case where a single administration involves multiple pills
-- of the same strength: "2 × 500 mg acetaminophen, 3 times a day" =
-- pills_per_dose=2, dose='500 mg', doses_per_day=3.
--
-- Default 1 (the common case: one pill per administration). Range 1–20
-- caps the field at a sane upper bound — anything above is almost
-- certainly miskey or a different drug form (liquid, drops) that should
-- use the dose field instead.
--
-- NOT NULL with a default keeps the existing rows valid without a backfill
-- step (they get pills_per_dose=1, equivalent to the prior implicit
-- assumption). Pre-launch — no historical data concerns.

alter table public.medications
  add column pills_per_dose int not null default 1
  check (pills_per_dose between 1 and 20);
