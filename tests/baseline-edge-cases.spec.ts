// Walks the 10 baseline edge cases from
// docs/superpowers/plans/2026-05-08-baseline-edge-cases.md.
//
// Each test seeds the test caregiver's data via
// scripts/seed-baseline-cases.ts, navigates to /dashboard, takes a
// screenshot of the cold-start card (or the dashboard fallback), and
// asserts the visible eyebrow + headline + footer match the plan's
// expected output.

import { test, expect, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';

const exec = promisify(execFile);

const SCREENSHOT_DIR = 'docs/audits/baseline-screenshots';

test.beforeAll(() => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

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

async function snapshotDashboard(page: Page, name: string): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  // The page renders one of three things: BaselineProgressCard (cold-start),
  // a hero/vitals card, or the "no check-in yet" fallback. Wait until any
  // of those is on screen before screenshotting.
  await page.waitForSelector(
    '[data-testid="baseline-progress-card"], section[role="alert"], h1',
    { timeout: 15_000 },
  );
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/${name}.png`,
    fullPage: true,
  });
}

test.describe('Baseline edge cases', () => {
  test('Case 1 — 0 logs ever, fresh account', async ({ page }) => {
    await seed('1');
    await snapshotDashboard(page, 'case-1');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Setup · day 1 of 7/);
    await expect(card).toContainText(/We['’]re starting to learn what normal looks like\./);
    await expect(card).toContainText(/7 more mornings to go\./);
  });

  test('Case 2 — logged today only', async ({ page }) => {
    await seed('2');
    await snapshotDashboard(page, 'case-2');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Setup · day 1 of 7/);
    await expect(card).toContainText(/We['’]re starting to learn what normal looks like\./);
    await expect(card).toContainText(/6 more mornings to go\./);
  });

  test('Case 3 — 2 logs in window, today not logged', async ({ page }) => {
    await seed('3');
    await snapshotDashboard(page, 'case-3');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toContainText(/Setup · day 3 of 7/);
    await expect(card).toContainText(/Two mornings in\. Five to go\./);
    await expect(card).toContainText(/5 more mornings to go\./);
  });

  test('Case 4 — 2 logs 20+ days ago (outside window)', async ({ page }) => {
    await seed('4');
    await snapshotDashboard(page, 'case-4');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toContainText(/Setup · day 1 of 7/);
    await expect(card).toContainText(/We['’]re starting to learn what normal looks like\./);
    await expect(card).toContainText(/7 more mornings to go\./);
    // After fix (option b): when daysBanked === 0 AND startedAt !== today,
    // the "restarted today" eyebrow appears and the stale "started Apr 16"
    // footer is suppressed. Verify both.
    await expect(card).toContainText(/restarted today/);
    await expect(card).not.toContainText(/started Apr/);
  });

  test('Case 5 — 6 logs + today completes the baseline', async ({ page }) => {
    await seed('5');
    await snapshotDashboard(page, 'case-5');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toContainText(/Setup · day 7 of 7/);
    await expect(card).toContainText(/Today completes the baseline\./);
  });

  test('Case 5b — engine wrote cold_start=false, branch should exit', async ({ page }) => {
    await seed('5b');
    await snapshotDashboard(page, 'case-5b');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toHaveCount(0);
  });

  test('Case 6 — 7 logs across 14 days with gaps + race-seeded cold_start', async ({ page }) => {
    await seed('6');
    await snapshotDashboard(page, 'case-6');
    const card = page.getByTestId('baseline-progress-card');
    // After defensive-branch fix: the 7-dot track is suppressed and a
    // "Setup · 7 of 7 banked" card invites today's log. The eyebrow
    // stays in the "Setup ·" register so it doesn't collide with the
    // dashboard's still-learning header above.
    await expect(card).toContainText(/Setup · 7 of 7 banked/);
    await expect(card).toContainText(/Dictate today['’]s check-in to switch on alerts/);
    await expect(card).not.toContainText(/Setup · day \d of 7/);
  });

  test('Case 7 — today logged twice (multiple dictations same day)', async ({ page }) => {
    await seed('7');
    await snapshotDashboard(page, 'case-7');
    const card = page.getByTestId('baseline-progress-card');
    // De-duplicated to one banked-today; same render as Case 2.
    await expect(card).toContainText(/Setup · day 1 of 7/);
    await expect(card).toContainText(/6 more mornings to go\./);
  });

  test("Case 8 — today's log is pending (mid-recording)", async ({ page }) => {
    await seed('8');
    await snapshotDashboard(page, 'case-8');
    const card = page.getByTestId('baseline-progress-card');
    // logStatus is 'none' for pending → today excluded from loggedDatesForCard
    // → daysBanked=0 → eyebrow day 1 of 7, today is pulse-outline (no check).
    await expect(card).toContainText(/Setup · day 1 of 7/);
    await expect(card).toContainText(/7 more mornings to go\./);
  });

  test('Case 9 — patient TZ math (sanity)', async ({ page }) => {
    await seed('9');
    await snapshotDashboard(page, 'case-9');
    const card = page.getByTestId('baseline-progress-card');
    // Same shape as Case 3 (2 prior, today not logged), confirming
    // getTodayInTimezone math hasn't drifted. Real midnight-boundary
    // verification is documented in the audit, not asserted at runtime.
    await expect(card).toContainText(/Setup · day 3 of 7/);
  });

  test('Case 10 — patient existed for 60 days, no logs since', async ({ page }) => {
    await seed('10');
    await snapshotDashboard(page, 'case-10');
    const card = page.getByTestId('baseline-progress-card');
    await expect(card).toContainText(/Setup · day 1 of 7/);
    // startedAt falls back to today (no daily_logs row exists), so the
    // "started" footer reads today's pretty date — no false "60 days
    // into baseline" framing.
    await expect(card).not.toContainText(/restarted today/);
  });
});
