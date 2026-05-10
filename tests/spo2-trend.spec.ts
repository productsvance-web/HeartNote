// UI smoke for /trends/spo2: empty-state render, "+" sheet open, save
// commits a new reading, sub-88 save fires a Tier 1 alert. DB read after
// the save click is the source of truth.

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

async function clearSpo2(patientId: string): Promise<void> {
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  await admin()
    .from('daily_log_readings')
    .delete()
    .eq('patient_id', patientId)
    .eq('field', 'spo2');
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

async function seedOneSpo2(
  patientId: string,
  value: number,
): Promise<void> {
  await clearSpo2(patientId);
  const today = todayInPatientTz();
  const { data: log, error: logErr } = await admin()
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: today,
      processing_status: 'complete',
      transcribed_text: 'seed for spo2-trend.spec.ts',
    })
    .select('id')
    .single();
  if (logErr || !log) throw logErr ?? new Error('seed log failed');
  await admin().from('daily_log_readings').insert({
    patient_id: patientId,
    log_date: today,
    recorded_at: new Date().toISOString(),
    field: 'spo2',
    value,
    source_log_id: log.id,
  });
}

async function readSpo2Count(patientId: string): Promise<number> {
  const { data, error } = await admin()
    .from('daily_log_readings')
    .select('id')
    .eq('patient_id', patientId)
    .eq('field', 'spo2');
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

test.describe('/trends/spo2', () => {
  let patientId: string;

  test.beforeAll(async () => {
    patientId = await findPatientId();
  });

  test('renders the page and floating + button', async ({ page }) => {
    await clearSpo2(patientId);

    await page.goto('/trends/spo2', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Oxygen' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add oxygen reading' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Back to trends/i }),
    ).toBeVisible();
  });

  test('+ button opens sheet, type + save commits a new SpO2 reading', async ({
    page,
  }) => {
    await seedOneSpo2(patientId, 97);
    const before = await readSpo2Count(patientId);

    await page.goto('/trends/spo2', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Oxygen' })).toBeVisible();

    const addBtn = page.getByRole('button', { name: 'Add oxygen reading' });
    await expect(addBtn).toBeVisible();
    await addBtn.click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add oxygen reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // SpO2 chip is the only inputmode=numeric input in the sheet.
    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('96');

    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readSpo2Count(patientId), { timeout: 15_000 })
      .toBe(before + 1);
    const { data } = await admin()
      .from('daily_log_readings')
      .select('value')
      .eq('patient_id', patientId)
      .eq('field', 'spo2');
    const values = (data ?? []).map((r) => Number(r.value));
    expect(values).toContain(96);
  });

  test('save 87 fires Tier 1 alert (T1.7a — Oxygen below 88 floor)', async ({
    page,
  }) => {
    await clearSpo2(patientId);
    const tier1Before = await readAlertCount(patientId, 'tier_1_911');

    await page.goto('/trends/spo2', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add oxygen reading' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add oxygen reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('87');

    await dialog.getByRole('button', { name: 'Save' }).click();

    // The engine's T1.7a rule should insert exactly one new tier_1_911
    // alert row referencing this save's daily_log_id.
    await expect
      .poll(() => readAlertCount(patientId, 'tier_1_911'), {
        timeout: 15_000,
      })
      .toBe(tier1Before + 1);
  });

  test('increment button advances the value by one tap (integer step)', async ({
    page,
  }) => {
    await seedOneSpo2(patientId, 97);

    await page.goto('/trends/spo2', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add oxygen reading' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add oxygen reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('95');

    await dialog.getByRole('button', { name: 'Increment oxygen' }).click();
    await expect(chip).toHaveValue('96');
  });

  test('sheet Cancel closes without writing', async ({ page }) => {
    await seedOneSpo2(patientId, 97);
    const before = await readSpo2Count(patientId);

    await page.goto('/trends/spo2', { waitUntil: 'networkidle' });
    const addBtn = page.getByRole('button', { name: 'Add oxygen reading' });
    await expect(addBtn).toBeVisible();
    await addBtn.click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add oxygen reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const after = await readSpo2Count(patientId);
    expect(after).toBe(before);
  });
});
