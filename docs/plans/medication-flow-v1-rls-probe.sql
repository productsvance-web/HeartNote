-- Two-caregiver RLS probe for medications + medication_events.
-- Verifies that the existing `for all` policies on both tables prevent
-- cross-caregiver SELECT and INSERT.
--
-- Per plan §Permissions/RLS in docs/plans/medication-flow-v1.md.
--
-- HOW TO RUN (against local Supabase):
--   1. Start local: `supabase start`
--   2. Open SQL editor at the local Supabase Studio.
--   3. Run the SETUP block as the postgres role (bypasses RLS).
--   4. Run each PROBE block in turn — each begins with a `SET LOCAL request.jwt.claims`
--      to impersonate that caregiver. The expected results are documented
--      next to each query.

-- ============================================================================
-- SETUP (run as postgres / service-role)
-- ============================================================================

-- Two caregivers; substitute real auth.users UUIDs from your local DB.
-- One easy path: sign in twice via the magic-link flow in the dev app, then
-- copy the two auth.users.id values here.
\set caregiver_a '00000000-0000-0000-0000-00000000000a'
\set caregiver_b '00000000-0000-0000-0000-00000000000b'

-- Patients (one per caregiver)
insert into public.patients (id, caregiver_id, display_name, relationship)
values
  ('11111111-1111-1111-1111-111111111111', :'caregiver_a', 'Patient A', 'mother'),
  ('22222222-2222-2222-2222-222222222222', :'caregiver_b', 'Patient B', 'father')
on conflict (id) do nothing;

-- Meds (Lasix for A's patient, Bumex for B's patient)
insert into public.medications (id, patient_id, drug_name, drug_class, doses_per_day)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Lasix', 'loop_diuretic', 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'Bumex', 'loop_diuretic', 2)
on conflict (id) do nothing;

-- ============================================================================
-- PROBE 1: caregiver B can SELECT only their own meds
-- ============================================================================

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

-- Expected: ONE row, drug_name='Bumex'. Lasix is filtered by RLS.
select drug_name from public.medications;

rollback;

-- ============================================================================
-- PROBE 2: caregiver B cannot INSERT a medication_event against A's medication
-- ============================================================================

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

-- Expected: ERROR — `new row violates row-level security policy`.
-- The policy `caregiver crud own med events` requires the linked patient's
-- caregiver_id to match auth.uid(). A's patient_id has caregiver_id = A,
-- not B, so the WITH CHECK clause fails.
insert into public.medication_events
  (patient_id, medication_id, status, actual_taken_at)
values
  ('11111111-1111-1111-1111-111111111111',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'taken',
   now());

rollback;

-- ============================================================================
-- PROBE 3: caregiver B CAN insert against their own medication
-- ============================================================================

begin;
set local role authenticated;
set local request.jwt.claims to '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}';

-- Expected: ONE row inserted, no error.
insert into public.medication_events
  (patient_id, medication_id, status, actual_taken_at)
values
  ('22222222-2222-2222-2222-222222222222',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'taken',
   now());

-- Expected: ONE row visible (just inserted).
select count(*) from public.medication_events
  where medication_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

rollback;

-- ============================================================================
-- TEARDOWN (optional — only if SETUP rows are no longer needed)
-- ============================================================================
-- delete from public.medications where id in
--   ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
-- delete from public.patients where id in
--   ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
