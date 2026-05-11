// UI smoke for /trends/hr: page render, "+" sheet save, alert firing
// on HR > 120 (T2.11a), increment button, Cancel.

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

async function clearHr(patientId: string): Promise<void> {
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  await admin()
    .from('daily_log_readings')
    .delete()
    .eq('patient_id', patientId)
    .eq('field', 'resting_hr');
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

async function seedOneHr(patientId: string, value: number): Promise<void> {
  await clearHr(patientId);
  const today = todayInPatientTz();
  const { data: log, error: logErr } = await admin()
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: today,
      processing_status: 'complete',
      transcribed_text: 'seed for hr-trend.spec.ts',
    })
    .select('id')
    .single();
  if (logErr || !log) throw logErr ?? new Error('seed log failed');
  await admin().from('daily_log_readings').insert({
    patient_id: patientId,
    log_date: today,
    recorded_at: new Date().toISOString(),
    field: 'resting_hr',
    value,
    source_log_id: log.id,
  });
}

async function readHrCount(patientId: string): Promise<number> {
  const { data, error } = await admin()
    .from('daily_log_readings')
    .select('id')
    .eq('patient_id', patientId)
    .eq('field', 'resting_hr');
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

test.describe('/trends/hr', () => {
  let patientId: string;

  test.beforeAll(async () => {
    patientId = await findPatientId();
  });

  test('renders the page and floating + button', async ({ page }) => {
    await clearHr(patientId);
    await page.goto('/trends/hr', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Resting heart rate' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add resting heart rate' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Back to trends/i }),
    ).toBeVisible();
  });

  test('+ button opens sheet, type + save commits a new HR reading', async ({
    page,
  }) => {
    await seedOneHr(patientId, 76);
    const before = await readHrCount(patientId);

    await page.goto('/trends/hr', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add resting heart rate' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add resting heart rate reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('72');

    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readHrCount(patientId), { timeout: 15_000 })
      .toBe(before + 1);
    const { data } = await admin()
      .from('daily_log_readings')
      .select('value')
      .eq('patient_id', patientId)
      .eq('field', 'resting_hr');
    const values = (data ?? []).map((r) => Number(r.value));
    expect(values).toContain(72);
  });

  test('save 125 fires Tier 2 alert (T2.11a — HR > 120)', async ({ page }) => {
    await clearHr(patientId);
    const before = await readAlertCount(patientId, 'tier_2_today');

    await page.goto('/trends/hr', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add resting heart rate' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add resting heart rate reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('125');

    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readAlertCount(patientId, 'tier_2_today'), {
        timeout: 15_000,
      })
      .toBe(before + 1);
  });

  test('increment button advances the value by one tap', async ({ page }) => {
    await seedOneHr(patientId, 76);
    await page.goto('/trends/hr', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add resting heart rate' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add resting heart rate reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('80');

    await dialog
      .getByRole('button', { name: 'Increment resting heart rate' })
      .click();
    await expect(chip).toHaveValue('81');
  });

  test('sheet Cancel closes without writing', async ({ page }) => {
    await seedOneHr(patientId, 76);
    const before = await readHrCount(patientId);

    await page.goto('/trends/hr', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add resting heart rate' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add resting heart rate reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const after = await readHrCount(patientId);
    expect(after).toBe(before);
  });
});
