// Short-lived flag cookie set by /auth/confirm when the user verifies a recovery
// (password-reset) token. /auth/update-password gates on its presence so a
// normally-signed-in user can't accidentally trigger a password change by
// navigating to that URL. The cookie's existence is the signal — the value
// itself is opaque and not validated.
export const RECOVERY_COOKIE = 'hn_recovery';
export const RECOVERY_COOKIE_MAX_AGE_SECONDS = 300; // 5 minutes
