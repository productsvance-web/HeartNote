// Constants shared between the seed script and the Playwright suite.
// Kept in its own module so importing TEST_EMAIL from a Playwright
// global-setup doesn't trigger seed-baseline-cases.ts main().

export const TEST_EMAIL = 'test-baseline@heartnote.local';
export const TEST_PASSWORD = 'baseline-edge-cases-2026!';
