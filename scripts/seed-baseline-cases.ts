// Seeds the test-baseline caregiver's data for one of the 10 baseline
// edge-case scenarios in docs/superpowers/plans/2026-05-08-baseline-edge-cases.md.
//
// Usage:
//   node --env-file=.env.local --experimental-strip-types scripts/seed-baseline-cases.ts <case-N>
//   node --env-file=.env.local --experimental-strip-types scripts/seed-baseline-cases.ts case-5b   # for Case 5 post-engine state
//
// PHI safety: only ever writes to a known synthetic test caregiver
// (test-baseline@heartnote.local) marked `app_metadata.synthetic = true`
// at create time. Refuses to operate on a same-email user that lacks
// the flag — protects against collisions on shared dev databases.
// Refuses to run with NODE_ENV=production.
//
// Direct Supabase client instantiation is intentional here: this is a
// service-role admin script, not a request-scoped component, so it
// bypasses the @/lib/supabase/{client,server,middleware} convention.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_EMAIL, TEST_PASSWORD } from './baseline-test-fixtures.ts';

export { TEST_EMAIL, TEST_PASSWORD };
const TEST_TZ = 'America/Los_Angeles';
const PATIENT_NAME = 'Patricia';

let _admin: SupabaseClient | null = null;
function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run in production');
  }
  _admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}

function todayInTZ(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function isoOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function ensureTestUser(): Promise<{ caregiverId: string; patientId: string }> {
  const list = await admin().auth.admin.listUsers();
  if (list.error) throw list.error;
  let user = list.data.users.find((u) => u.email === TEST_EMAIL) ?? null;
  if (!user) {
    const { data, error } = await admin().auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      app_metadata: { synthetic: true },
    });
    if (error) throw error;
    user = data.user;
    console.log('Created test caregiver:', user.id);
  } else if (user.app_metadata?.synthetic !== true) {
    // Backfill the synthetic stamp on accounts created before this guard
    // existed. Updating app_metadata does not invalidate active refresh
    // tokens (only password / email changes do). After backfill, every
    // subsequent run goes through the no-op fast path.
    const { error } = await admin().auth.admin.updateUserById(user.id, {
      app_metadata: { ...(user.app_metadata ?? {}), synthetic: true },
    });
    if (error) throw error;
    console.log('Backfilled app_metadata.synthetic on existing test caregiver:', user.id);
  }
  // Existing user: don't touch the password — admin updateUserById
  // invalidates active refresh tokens, which would kill the session
  // captured by Playwright's global-setup.

  await admin().from('profiles').upsert({
    id: user.id,
    display_name: 'Test Caregiver',
    timezone: TEST_TZ,
    onboarding_completed_at: new Date().toISOString(),
  });

  const { data: existing } = await admin()
    .from('patients')
    .select('id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  let patientId = existing?.id ?? null;
  if (!patientId) {
    const { data, error } = await admin()
      .from('patients')
      .insert({
        caregiver_id: user.id,
        display_name: PATIENT_NAME,
        relationship: 'mother',
        dry_weight_lb: 178,
        normal_pillow_count: 1,
        nyha_class: 'II',
      })
      .select('id')
      .single();
    if (error) throw error;
    patientId = data.id;
    console.log('Created test patient:', patientId);
  }

  return { caregiverId: user.id, patientId: patientId! };
}

async function resetPatientData(patientId: string): Promise<void> {
  // Order matters: foreign-key chains. delete leaves first.
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  await admin().from('daily_log_readings').delete().eq('patient_id', patientId);
  await admin().from('daily_log_symptom_events').delete().eq('patient_id', patientId);
  await admin().from('daily_logs').delete().eq('patient_id', patientId);
}

async function insertLog(
  patientId: string,
  date: string,
  opts: {
    status?: 'pending' | 'analyzing' | 'complete' | 'failed';
    weightLb?: number;
    pillowCount?: number;
    swelling?: boolean;
    coughNocturnal?: boolean;
  } = {},
): Promise<string> {
  const status = opts.status ?? 'complete';
  const recordedAt = `${date}T08:00:00.000Z`;
  const { data, error } = await admin()
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: date,
      processing_status: status,
      pillow_count: opts.pillowCount ?? null,
      transcribed_text: status === 'complete' ? `Seeded log for ${date}.` : null,
      ai_processed_at: status === 'complete' ? recordedAt : null,
    })
    .select('id')
    .single();
  if (error) throw error;
  const logId = data.id as string;

  if (status === 'complete' && opts.weightLb !== undefined) {
    await admin().from('daily_log_readings').insert({
      patient_id: patientId,
      log_date: date,
      field: 'weight_lb',
      value: opts.weightLb,
      recorded_at: recordedAt,
      source_log_id: logId,
    });
  }
  if (status === 'complete' && opts.swelling) {
    await admin().from('daily_log_symptom_events').insert({
      patient_id: patientId,
      log_date: date,
      symptom: 'swelling',
      present: true,
      recorded_at: recordedAt,
      source_log_id: logId,
      body_region: 'ankles',
      severity: 1,
    });
  }
  if (status === 'complete' && opts.coughNocturnal) {
    await admin().from('daily_log_symptom_events').insert({
      patient_id: patientId,
      log_date: date,
      symptom: 'cough',
      present: true,
      nocturnal: true,
      recorded_at: recordedAt,
      source_log_id: logId,
    });
  }
  return logId;
}

async function insertAssessment(
  patientId: string,
  date: string,
  opts: { tier: 'tier_1_911' | 'tier_2_today' | 'tier_3_48hr' | 'tier_4_log'; coldStart: boolean },
): Promise<void> {
  await admin().from('daily_assessments').insert({
    patient_id: patientId,
    log_date: date,
    tier: opts.tier,
    cold_start: opts.coldStart,
    triggers: [],
  });
}

const CASES = {
  1: async (_pid: string) => {
    // No logs ever — nothing to seed beyond the reset.
  },
  2: async (pid: string, today: string) => {
    await insertLog(pid, today, { weightLb: 178.4, swelling: true });
  },
  3: async (pid: string, today: string) => {
    await insertLog(pid, isoOffset(today, -13), { weightLb: 177.8 });
    await insertLog(pid, isoOffset(today, -10), { weightLb: 178.1, swelling: true });
  },
  4: async (pid: string, today: string) => {
    // Two logs ~3 weeks ago — both outside the 14-day window.
    await insertLog(pid, isoOffset(today, -22), { weightLb: 177.2 });
    await insertLog(pid, isoOffset(today, -21), { weightLb: 177.5 });
  },
  5: async (pid: string, today: string) => {
    // 6 prior logs + today logged. Heuristic in dashboard.tsx fires
    // because no assessment row exists yet (engine hasn't run).
    for (let d = 6; d >= 1; d--) {
      await insertLog(pid, isoOffset(today, -d), {
        weightLb: 178 + d * 0.1,
        swelling: d % 2 === 0,
      });
    }
    await insertLog(pid, today, { weightLb: 178.5 });
  },
  '5b': async (pid: string, today: string) => {
    // Same as Case 5 plus the engine has run and decided cold_start=false.
    // Verifies the dashboard exits cold-start on the next page-load.
    for (let d = 6; d >= 1; d--) {
      await insertLog(pid, isoOffset(today, -d), {
        weightLb: 178 + d * 0.1,
        swelling: d % 2 === 0,
      });
    }
    await insertLog(pid, today, { weightLb: 178.5 });
    await insertAssessment(pid, today, { tier: 'tier_4_log', coldStart: false });
  },
  6: async (pid: string, today: string) => {
    // 7 distinct logs in the 14-day window (with gaps), today not yet
    // logged. Race-condition seed: assessment row says cold_start=true
    // even though the bank has 7 days. Forces the bug branch.
    const offsets = [-13, -11, -9, -7, -5, -3, -1];
    for (const o of offsets) {
      await insertLog(pid, isoOffset(today, o), { weightLb: 178 + Math.abs(o) * 0.05 });
    }
    await insertAssessment(pid, today, { tier: 'tier_4_log', coldStart: true });
  },
  7: async (pid: string, today: string) => {
    await insertLog(pid, today, { weightLb: 178.4 });
    await insertLog(pid, today, { weightLb: 178.5, swelling: true });
  },
  8: async (pid: string, today: string) => {
    // Today's log is mid-processing, no transcript.
    await insertLog(pid, today, { status: 'pending' });
  },
  9: async (pid: string, today: string) => {
    // TZ behavior is asserted in code review — the seed is identical to
    // Case 3 (two prior logs in window, today not logged). The assertion
    // checks that today's date matches Intl.DateTimeFormat for the test
    // patient TZ, not server UTC.
    await insertLog(pid, isoOffset(today, -2), { weightLb: 178 });
    await insertLog(pid, isoOffset(today, -1), { weightLb: 178.2 });
  },
  10: async (_pid: string, _today: string) => {
    // 60-day-old patient with no logs since creation. The test patient
    // already exists; we don't backdate created_at because the
    // BaselineProgressCard derives "started" from the first daily_logs
    // row, which is null in this case → falls back to today.
  },
} as const;

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: seed-baseline-cases.ts <case-1..10|case-5b>');
    process.exit(1);
  }
  const caseKey = arg.replace(/^case-/, '') as keyof typeof CASES;
  if (!(caseKey in CASES)) {
    console.error(`Unknown case "${arg}". Valid: ${Object.keys(CASES).join(', ')}`);
    process.exit(1);
  }

  const { patientId } = await ensureTestUser();
  await resetPatientData(patientId);
  const today = todayInTZ(TEST_TZ);
  console.log(`Seeding case-${String(caseKey)} (today=${today}, patient=${patientId})…`);
  await CASES[caseKey](patientId, today);
  console.log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
