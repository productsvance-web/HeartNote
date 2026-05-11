// UI smoke for /trends/bp: page render, "+" sheet save commits TWO
// daily_log_readings rows (sys + dia, same source_log_id), alert
// firing on SBP ≤ 89 + dizziness symptom event (T2.10).

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_EMAIL } from '../scripts/baseline-test-fixtures.ts';

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findPatientId(): Promise<string> {
  const list = await admin().auth.admin.listUsers();
  if (list.error) throw list.error;
  const user = list.data.users.find((u) => u.email === TEST_EMAIL);
  if (!user) throw new Error('Test caregiver missing — run seed first.');
  const { data } = await admin()
    .from('patients')
    .select('id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!data) throw new Error('No test patient.');
  return data.id as string;
}

async function clearBp(patientId: string): Promise<void> {
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  await admin()
    .from('daily_log_readings')
    .delete()
    .eq('patient_id', patientId)
    .in('field', ['systolic_bp', 'diastolic_bp']);
  await admin()
    .from('daily_log_symptom_events')
    .delete()
    .eq('patient_id', patientId);
}

const PATIENT_TZ = 'America/Los_Angeles';

function todayInPatientTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PATIENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function seedDizzinessToday(patientId: string): Promise<void> {
  const today = todayInPatientTz();
  const { data: log, error: logErr } = await admin()
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: today,
      processing_status: 'complete',
      transcribed_text: 'seed dizziness symptom',
    })
    .select('id')
    .single();
  if (logErr || !log) throw logErr ?? new Error('seed dizziness log failed');
  await admin().from('daily_log_symptom_events').insert({
    patient_id: patientId,
    log_date: today,
    recorded_at: new Date().toISOString(),
    symptom: 'cognition_change',
    present: true,
    severity: 1,
    source_log_id: log.id,
  });
}

async function readBpRowCount(patientId: string): Promise<number> {
  const { data, error } = await admin()
    .from('daily_log_readings')
    .select('id')
    .eq('patient_id', patientId)
    .in('field', ['systolic_bp', 'diastolic_bp']);
  if (error) throw error;
  return data.length;
}

async function readAlertCount(
  patientId: string,
  tier: string,
): Promise<number> {
  const { data, error } = await admin()
    .from('alerts')
    .select('id')
    .eq('patient_id', patientId)
    .eq('tier', tier);
  if (error) throw error;
  return data.length;
}

test.describe('/trends/bp', () => {
  let patientId: string;

  test.beforeAll(async () => {
    patientId = await findPatientId();
  });

  test('renders the page and floating + button', async ({ page }) => {
    await clearBp(patientId);
    await page.goto('/trends/bp', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Blood pressure' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add blood pressure' }),
    ).toBeVisible();
  });

  test('+ button save commits TWO daily_log_readings rows (sys + dia)', async ({
    page,
  }) => {
    await clearBp(patientId);
    const before = await readBpRowCount(patientId);

    await page.goto('/trends/bp', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add blood pressure' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add blood pressure reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Dial sys to 130, dia to 80 via stepper increments. Starting
    // floor is the field min (sys 60, dia 30); use the chip inputs.
    const sysInput = dialog.getByLabel('Edit Systolic');
    const diaInput = dialog.getByLabel('Edit Diastolic');
    await sysInput.fill('130');
    await sysInput.blur();
    await diaInput.fill('80');
    await diaInput.blur();

    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readBpRowCount(patientId), { timeout: 15_000 })
      .toBe(before + 2);
    const { data } = await admin()
      .from('daily_log_readings')
      .select('field, value, source_log_id')
      .eq('patient_id', patientId)
      .in('field', ['systolic_bp', 'diastolic_bp']);
    const rows = data ?? [];
    const sys = rows.find((r) => r.field === 'systolic_bp');
    const dia = rows.find((r) => r.field === 'diastolic_bp');
    expect(sys?.value).toBe(130);
    expect(dia?.value).toBe(80);
    expect(sys?.source_log_id).toBe(dia?.source_log_id);
  });

  test('save 85 / 60 with dizziness today fires Tier 2 alert (T2.10)', async ({
    page,
  }) => {
    await clearBp(patientId);
    await seedDizzinessToday(patientId);
    const before = await readAlertCount(patientId, 'tier_2_today');

    await page.goto('/trends/bp', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add blood pressure' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add blood pressure reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByLabel('Edit Systolic').fill('85');
    await dialog.getByLabel('Edit Systolic').blur();
    await dialog.getByLabel('Edit Diastolic').fill('60');
    await dialog.getByLabel('Edit Diastolic').blur();

    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readAlertCount(patientId, 'tier_2_today'), {
        timeout: 15_000,
      })
      .toBe(before + 1);
  });

  test('sheet Cancel closes without writing', async ({ page }) => {
    await clearBp(patientId);
    const before = await readBpRowCount(patientId);

    await page.goto('/trends/bp', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add blood pressure' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add blood pressure reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const after = await readBpRowCount(patientId);
    expect(after).toBe(before);
  });
});
