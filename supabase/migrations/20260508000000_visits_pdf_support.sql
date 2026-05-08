-- Visit-prep PDF support.
--
-- The PDF's "what changed since last visit" section needs an explicit pointer
-- from each visit to its prior visit. Computing that on every render is
-- correct but slow under joins; pinning it on insert via trigger is cheap
-- and never has to drift because cardiology_visits rows are append-only
-- in practice (post-visit notes are mutated; visit_date is not).
--
-- patients.date_of_birth already exists from the initial schema and the
-- /me/patient/edit form is being extended to collect it; no schema change
-- needed for DOB.

alter table public.cardiology_visits
  add column last_visit_id uuid references public.cardiology_visits(id) on delete set null;

create or replace function public.cardiology_visits_set_last_visit_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_visit_id is null then
    select id
      into new.last_visit_id
      from public.cardiology_visits
     where patient_id = new.patient_id
       and visit_date < new.visit_date
     order by visit_date desc, created_at desc
     limit 1;
  end if;
  return new;
end;
$$;

create trigger cardiology_visits_set_last_visit_id
before insert on public.cardiology_visits
for each row
execute function public.cardiology_visits_set_last_visit_id();
