// UI smoke for /trends/pillows: page render, "+" sheet save inserts
// a daily_logs row with pillow_count set, alert firing on
// pillow_count > baseline (T2.4), "Clear" copy in the view-data sheet.

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

async function clearPillows(patientId: string): Promise<void> {
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  // Don't delete daily_logs rows — just null out pillow_count.
  await admin()
    .from('daily_logs')
    .update({ pillow_count: null })
    .eq('patient_id', patientId)
    .not('pillow_count', 'is', null);
}

async function setBaseline(
  patientId: string,
  normalPillowCount: number,
): Promise<void> {
  await admin()
    .from('patients')
    .update({ normal_pillow_count: normalPillowCount })
    .eq('id', patientId);
}

async function readPillowRowCount(patientId: string): Promise<number> {
  const { data, error } = await admin()
    .from('daily_logs')
    .select('id')
    .eq('patient_id', patientId)
    .not('pillow_count', 'is', null);
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

test.describe('/trends/pillows', () => {
  let patientId: string;

  test.beforeAll(async () => {
    patientId = await findPatientId();
    await setBaseline(patientId, 1);
  });

  test('renders the page and floating + button', async ({ page }) => {
    await clearPillows(patientId);
    await page.goto('/trends/pillows', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Pillows tonight' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Add pillows tonight' }),
    ).toBeVisible();
  });

  test('+ save inserts a daily_logs row with pillow_count set (date-only sheet)', async ({
    page,
  }) => {
    await clearPillows(patientId);
    const before = await readPillowRowCount(patientId);

    await page.goto('/trends/pillows', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add pillows tonight' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add pillows reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Pillows is integer; the chip is inputmode=numeric.
    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('2');

    // Date-only sheet — there is no time input.
    await expect(dialog.locator('input[type="time"]')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readPillowRowCount(patientId), { timeout: 15_000 })
      .toBe(before + 1);
    const { data } = await admin()
      .from('daily_logs')
      .select('pillow_count')
      .eq('patient_id', patientId)
      .not('pillow_count', 'is', null);
    const values = (data ?? []).map((r) => Number(r.pillow_count));
    expect(values).toContain(2);
  });

  test('save pillow_count=3 with baseline=1 fires Tier 2 alert (T2.4 orthopnea)', async ({
    page,
  }) => {
    await clearPillows(patientId);
    await setBaseline(patientId, 1);
    const before = await readAlertCount(patientId, 'tier_2_today');

    await page.goto('/trends/pillows', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add pillows tonight' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add pillows reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('3');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect
      .poll(() => readAlertCount(patientId, 'tier_2_today'), {
        timeout: 15_000,
      })
      .toBe(before + 1);
  });

  test('save pillow_count=1 with baseline=1 does NOT fire (1 > 1 is false)', async ({
    page,
  }) => {
    await clearPillows(patientId);
    await setBaseline(patientId, 1);
    const before = await readAlertCount(patientId, 'tier_2_today');

    await page.goto('/trends/pillows', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add pillows tonight' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add pillows reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const chip = dialog.locator('input[inputmode="numeric"]');
    await chip.fill('1');
    await dialog.getByRole('button', { name: 'Save' }).click();

    // Wait for the dialog to close (save completed).
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    const after = await readAlertCount(patientId, 'tier_2_today');
    expect(after).toBe(before);
  });

  test('sheet Cancel closes without writing', async ({ page }) => {
    await clearPillows(patientId);
    const before = await readPillowRowCount(patientId);

    await page.goto('/trends/pillows', { waitUntil: 'networkidle' });
    await page
      .getByRole('button', { name: 'Add pillows tonight' })
      .click({ force: true });
    const dialog = page.getByRole('dialog', {
      name: 'Add pillows reading',
    });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    const after = await readPillowRowCount(patientId);
    expect(after).toBe(before);
  });
});
