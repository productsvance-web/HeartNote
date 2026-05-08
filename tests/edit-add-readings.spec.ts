// Walks the inline "Add a reading" / "Add a symptom" affordances on
// /log/[id]/edit. Seeds a fresh daily_logs row with no extracted
// readings or symptoms, opens the edit page, exercises the pickers,
// saves, and asserts the new rows landed in daily_log_readings /
// daily_log_symptom_events with source_log_id pointing at the seeded log.
//
// Reuses the storageState captured by tests/global-setup.ts so the test
// caregiver is already signed in.

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { TEST_EMAIL } from '../scripts/baseline-test-fixtures.ts';

function admin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local.',
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function findCaregiver(): Promise<string> {
  const list = await admin().auth.admin.listUsers();
  if (list.error) throw list.error;
  const user = list.data.users.find((u) => u.email === TEST_EMAIL);
  if (!user) throw new Error(`Test caregiver ${TEST_EMAIL} missing — run seed first.`);
  return user.id;
}

async function findPatient(caregiverId: string): Promise<string> {
  const { data, error } = await admin()
    .from('patients')
    .select('id')
    .eq('caregiver_id', caregiverId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('No test patient found.');
  return data.id;
}

async function resetAndSeedEmptyLog(patientId: string): Promise<string> {
  // Order matters: foreign-key chains. Mirror seed-baseline-cases.ts.
  await admin().from('alerts').delete().eq('patient_id', patientId);
  await admin().from('daily_assessments').delete().eq('patient_id', patientId);
  await admin().from('daily_log_readings').delete().eq('patient_id', patientId);
  await admin().from('daily_log_symptom_events').delete().eq('patient_id', patientId);
  await admin().from('daily_logs').delete().eq('patient_id', patientId);

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await admin()
    .from('daily_logs')
    .insert({
      patient_id: patientId,
      log_date: today,
      processing_status: 'complete',
      transcribed_text: 'Seeded log for edit-add-readings.spec.ts.',
      ai_processed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

test.describe('Add inline readings + symptoms on /log/[id]/edit', () => {
  test('Confirm starts disabled until field + value are filled; out-of-range surfaces an error', async ({
    page,
  }) => {
    const caregiverId = await findCaregiver();
    const patientId = await findPatient(caregiverId);
    const logId = await resetAndSeedEmptyLog(patientId);

    await page.goto(`/log/${logId}/edit`, { waitUntil: 'domcontentloaded' });

    // Open the reading picker.
    await page.getByRole('button', { name: 'Add a reading' }).first().click();

    // Confirm starts disabled.
    const confirmBtn = page.getByRole('button', { name: 'Confirm' });
    await expect(confirmBtn).toBeDisabled();

    // Pick a field — value is still empty so Confirm stays disabled.
    await page.getByLabel('New reading field').selectOption('weight_lb');
    await expect(confirmBtn).toBeDisabled();

    // Type an out-of-range value, click Confirm — error surfaces.
    await page.getByLabel('New reading value').fill('1000');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();
    await expect(page.getByText(/Out of range/)).toBeVisible();
  });

  test('Add a weight reading + a swelling symptom, save, persists with source_log_id', async ({
    page,
  }) => {
    const caregiverId = await findCaregiver();
    const patientId = await findPatient(caregiverId);
    const logId = await resetAndSeedEmptyLog(patientId);

    await page.goto(`/log/${logId}/edit`, { waitUntil: 'domcontentloaded' });

    // Add a weight reading.
    await page.getByRole('button', { name: 'Add a reading' }).first().click();
    await page.getByLabel('New reading field').selectOption('weight_lb');
    await page.getByLabel('New reading value').fill('178.4');
    await page.getByRole('button', { name: 'Confirm' }).click();

    // Picker closes; new reading row visible by label.
    await expect(page.getByText('Weight').first()).toBeVisible();

    // Add a symptom.
    await page.getByRole('button', { name: 'Add a symptom' }).first().click();
    await page.getByLabel('New symptom').selectOption('swelling');
    await page.getByRole('button', { name: 'Confirm' }).click();

    // New symptom row visible.
    await expect(page.getByText('Swelling').first()).toBeVisible();

    // Save.
    await page.getByRole('button', { name: /Save changes/ }).click();

    // After save we navigate to /log.
    await page.waitForURL(/\/log(\?|$)/, { timeout: 15_000 });

    // DB-side: the new rows landed with source_log_id = logId.
    const { data: readings } = await admin()
      .from('daily_log_readings')
      .select('field, value, source_log_id')
      .eq('source_log_id', logId);
    expect(readings).toHaveLength(1);
    expect(readings![0].field).toBe('weight_lb');
    expect(Number(readings![0].value)).toBeCloseTo(178.4, 1);

    const { data: events } = await admin()
      .from('daily_log_symptom_events')
      .select('symptom, present, source_log_id')
      .eq('source_log_id', logId);
    expect(events).toHaveLength(1);
    expect(events![0].symptom).toBe('swelling');
    expect(events![0].present).toBe(true);
  });
});
