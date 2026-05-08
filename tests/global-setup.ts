// Global setup for the baseline edge-cases Playwright run.
//
// Generates a magic-link via Supabase admin (service-role key), redeems
// it through the app's /auth/callback route in a real browser context,
// and stashes the resulting cookies so per-case tests can hit /dashboard
// already authenticated.

import { chromium, type FullConfig } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { TEST_EMAIL } from '../scripts/baseline-test-fixtures.ts';

const STORAGE_PATH = 'tests/.auth/baseline-caregiver.json';
const exec = promisify(execFile);

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error('Global setup needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');
  }

  // Ensure the synthetic test caregiver exists before requesting a magic
  // link for them. On a fresh database `generateLink` would otherwise
  // fail with "user not found." Running case-1 also leaves the test
  // patient in a known-empty state.
  await exec(
    'node',
    [
      '--env-file=.env.local',
      '--experimental-strip-types',
      'scripts/seed-baseline-cases.ts',
      'case-1',
    ],
    { cwd: process.cwd() },
  );

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: TEST_EMAIL,
    options: { redirectTo: 'https://localhost:3001/auth/callback' },
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${error?.message ?? 'no hashed_token'}`);
  }
  const tokenHash = data.properties.hashed_token;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(
    `https://localhost:3001/auth/callback?token_hash=${tokenHash}&type=magiclink`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForURL(/\/(dashboard|onboarding|login)/, { timeout: 30_000 });
  const finalUrl = page.url();
  console.log('[global-setup] post-auth URL:', finalUrl);
  if (finalUrl.includes('/login')) {
    throw new Error(`Auth bounced to login: ${finalUrl}`);
  }

  // Verify the captured session resolves /dashboard end-to-end before we
  // hand storageState to the suite.
  await page.goto('https://localhost:3001/dashboard', { waitUntil: 'domcontentloaded' });
  console.log('[global-setup] dashboard verify URL:', page.url());
  if (page.url().includes('/login')) {
    throw new Error('Session captured but /dashboard redirected to /login');
  }

  mkdirSync(dirname(STORAGE_PATH), { recursive: true });
  await ctx.storageState({ path: STORAGE_PATH });
  await browser.close();
}
