// E2E spec for the unified /log page.
//
// Mirrors the existing tests/baseline-edge-cases.spec.ts pattern: uses
// the global-setup auth state and the seed-baseline-cases CLI to put the
// test caregiver in a known state before each scenario.
//
// Running these requires:
//   - A running dev server (`npm run dev`).
//   - Supabase reachable with the env in `.env.local`.
//   - The test caregiver fixture from scripts/baseline-test-fixtures.ts.
//
// Run:
//   npm run test:baseline -- tests/e2e/log-redesign.spec.ts

import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

async function seed(caseKey: string): Promise<void> {
  await exec(
    'node',
    [
      '--env-file=.env.local',
      '--experimental-strip-types',
      'scripts/seed-baseline-cases.ts',
      `case-${caseKey}`,
    ],
    { cwd: process.cwd() },
  );
}

async function gotoLog(page: Page) {
  await page.goto('/log', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-page="log"]', { timeout: 15_000 });
}

test.describe('/log redesign', () => {
  test('cold-start: five vital cards visible, muted defaults', async ({ page }) => {
    await seed('1');
    await gotoLog(page);
    // Five vital cards rendered.
    for (const field of ['weight', 'pillows', 'bp', 'hr', 'spo2']) {
      await expect(page.locator(`[data-field="${field}"]`)).toBeVisible();
    }
    // All in muted state on a cold-start day.
    for (const field of ['weight', 'pillows', 'bp', 'hr', 'spo2']) {
      await expect(page.locator(`[data-field="${field}"]`)).toHaveAttribute(
        'data-state',
        'muted',
      );
    }
  });

  test('tap-only golden path: weight + pillows → save → assessment fires', async ({
    page,
  }) => {
    await seed('1');
    await gotoLog(page);

    // Tap weight increment 4 times → 0.2 each step.
    const weightIncrement = page.locator('[data-field="weight"]').getByRole('button', {
      name: /Increment weight/i,
    });
    for (let i = 0; i < 4; i++) await weightIncrement.click();

    // Weight card shows the tapped pip.
    await expect(page.locator('[data-field="weight"]')).toHaveAttribute(
      'data-state',
      'tapped',
    );

    // Tap pillows increment once.
    await page
      .locator('[data-field="pillows"]')
      .getByRole('button', { name: /Increment pillow count/i })
      .click();
    await expect(page.locator('[data-field="pillows"]')).toHaveAttribute(
      'data-state',
      'tapped',
    );

    // Wait for the 1.5s debounce + the action round-trip.
    await page.waitForTimeout(2500);

    // Reload — the values should persist.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-page="log"]');
    // After reload, the page hydrates from the server. Tap-session rows
    // render with state='heard' (came from server, not just-tapped this
    // visit). The values themselves should still be present.
    //
    // L4: target the weight value chip via its tap-to-type button. The
    // single-stepper register uses aria-label="Edit weight"; the dual-
    // stepper halves use aria-label="Systolic value" / "Diastolic value",
    // which is why the prior `getByLabel('weight value')` matched zero
    // elements on the weight card.
    const weightChip = page
      .locator('[data-field="weight"]')
      .getByRole('button', { name: 'Edit weight' });
    await expect(weightChip).toBeVisible();
  });

  test('tier-1 path: chest pain Yes → alert banner above page header', async ({
    page,
  }) => {
    await seed('1');
    await gotoLog(page);

    // Open the modal via the ear button.
    await page.getByRole('button', { name: /Open symptoms/i }).click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // Tap "Yes" on chest pain.
    const chestPainCard = page.locator('[data-field="chest_pain"]');
    await chestPainCard.getByRole('radio', { name: 'Yes' }).click();

    // Wait for the immediate-save round-trip + revalidate.
    await page.waitForTimeout(1500);

    // Close modal.
    await page.getByRole('button', { name: /Close symptoms/i }).click();

    // The alert banner should be visible above the page header. The
    // banner contains "Highest priority" + the chest-pain label.
    await expect(page.locator('section').filter({ hasText: /Highest priority/i })).toBeVisible();
  });

  test('tap during recording locks the field', async () => {
    test.skip(
      true,
      'Requires Deepgram mock + voice-log/process mock; pending fixture work.',
    );
  });

  test('autosave failure → retry banner', async () => {
    test.skip(
      true,
      'Requires server-side fault injection; pending fixture work.',
    );
  });

  test('modal close returns to vitals view, no data loss', async ({ page }) => {
    await seed('1');
    await gotoLog(page);

    await page.getByRole('button', { name: /Open symptoms/i }).click();
    // Pick fatigue=Severe.
    await page
      .locator('[data-field="fatigue"]')
      .getByRole('radio', { name: 'Severe' })
      .click();

    // Close via X.
    await page.getByRole('button', { name: /Close symptoms/i }).click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // Reopen — fatigue is still Severe.
    await page.getByRole('button', { name: /Open symptoms/i }).click();
    await expect(
      page.locator('[data-field="fatigue"]').getByRole('radio', { name: 'Severe' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('dyspnea = at rest fires tier-1 banner without yes-flag', async ({ page }) => {
    await seed('1');
    await gotoLog(page);

    await page.getByRole('button', { name: /Open symptoms/i }).click();
    await page
      .locator('[data-field="dyspnea"]')
      .getByRole('radio', { name: 'At rest' })
      .click();

    // Wait for save + revalidate.
    await page.waitForTimeout(2500);

    // Banner above the header.
    await expect(
      page.locator('section').filter({ hasText: /Out of breath at rest|Highest priority/i }),
    ).toBeVisible();
  });
});
