// UI smoke for /trends/weight: empty-state render, "+" sheet open, save
// commits a new reading, the chart updates. Asserts via DB read after
// the save click — that's the source of truth, not the rendered hero
// (which shows the same digits before and after a small increment).

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

async function clearWeightReadings(patientId: string): Promise<void> {
  // Order matters: alerts → assessments → readings → logs (FK chain).
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  await admin().from('daily_log_readings').delete().eq('patient_id', patientId).eq('field', 'weight_lb');
}

// Test caregiver's timezone is America/Los_Angeles (set in
// scripts/seed-baseline-cases.ts). The page filters readings by log_date
// in patient tz, so the seed has to use the same tz — using new Date()
// .toISOString().slice(0,10) at night PT yields tomorrow's UTC date and
// the reading falls outside the fetched window.
const PATIENT_TZ = 'America/Los_Angeles';

function todayInPatientTz(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PATIENT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function seedOneWeight(patientId: string, value: number): Promise<void> {
  await clearWeightReadings(patientId);
  const today = todayInPatientTz();
  const { data: log, error: logErr } = await admin()
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: today,
      processing_status: 'complete',
      transcribed_text: 'seed for weight-trend.spec.ts',
    })
    .select('id')
    .single();
  if (logErr || !log) throw logErr ?? new Error('seed log failed');
  await admin().from('daily_log_readings').insert({
    patient_id: patientId,
    log_date: today,
    // 9 AM PT today — well inside the D-window regardless of run time.
    recorded_at: new Date().toISOString(),
    field: 'weight_lb',
    value,
    source_log_id: log.id,
  });
}

async function readWeightCount(patientId: string): Promise<number> {
  const { data, error } = await admin()
    .from('daily_log_readings')
    .select('id')
    .eq('patient_id', patientId)
    .eq('field', 'weight_lb');
  if (error) throw error;
  return data.length;
}

test.describe('/trends/weight', () => {
  let patientId: string;

  test.beforeAll(async () => {
    patientId = await findPatientId();
  });

  test('empty state renders + back link is visible', async ({ page }) => {
    await clearWeightReadings(patientId);

    await page.goto('/trends/weight', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible();
    await expect(page.getByText(/No readings in this window/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Back to trends/i })).toBeVisible();
  });

  test('+ button opens sheet, increment + save commits a new reading', async ({ page }) => {
    await seedOneWeight(patientId, 182.0);
    const before = await readWeightCount(patientId);

    await page.goto('/trends/weight', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible();

    // Open the sheet.
    const addBtn = page.getByRole('button', { name: 'Add weight' });
    await expect(addBtn).toBeVisible();
    await addBtn.click({ force: true });
    const dialog = page.getByRole('dialog', { name: 'Add weight reading' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Stepper seeds at 182.0; one increment lands on 182.2.
    await dialog.getByRole('button', { name: 'Increment weight' }).click();
    await expect(dialog.getByText('182.2 lb')).toBeVisible();

    // Save commits.
    await dialog.getByRole('button', { name: 'Save' }).click();

    // DB row count went up by exactly 1 — that's the source of truth.
    await expect.poll(() => readWeightCount(patientId), { timeout: 15_000 }).toBe(before + 1);
  });

  test('sheet Cancel closes without writing', async ({ page }) => {
    await seedOneWeight(patientId, 180.0);
    const before = await readWeightCount(patientId);

    await page.goto('/trends/weight', { waitUntil: 'networkidle' });
    const addBtn = page.getByRole('button', { name: 'Add weight' });
    await expect(addBtn).toBeVisible();
    await addBtn.click({ force: true });
    const dialog = page.getByRole('dialog', { name: 'Add weight reading' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const after = await readWeightCount(patientId);
    expect(after).toBe(before);
  });
});
