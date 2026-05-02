// Maps Supabase / OAuth / app-emitted error strings to caregiver-facing copy.
// Keep in one place so /login, /signup, /auth/forgot-password, /auth/update-password
// all show consistent language. Per CLAUDE.md rule 5 (grelief register): no chirp,
// no funeral, never leak raw provider error text.
export function friendlyError(raw: string): string {
  // Sign-in
  if (raw === 'invalid_credentials' || raw.toLowerCase().includes('invalid login credentials')) {
    return 'Email or password is incorrect.';
  }
  if (raw === 'email_not_confirmed' || raw.toLowerCase().includes('email not confirmed')) {
    return 'Check your email to confirm your account before signing in.';
  }

  // OAuth
  if (raw === 'oauth_cancelled' || raw.toLowerCase().includes('access_denied')) {
    return 'You cancelled signing in with Google. Try again or sign in with your email.';
  }

  // Password reset
  if (raw === 'reset_session_expired') {
    return 'That reset link expired or was already used. Request a new one — they’re valid for 1 hour.';
  }
  if (raw === 'link_expired' || raw.toLowerCase().includes('expired') || raw.toLowerCase().includes('already used')) {
    return 'That link expired or was already used. Request a new one.';
  }

  // Callback failures (apply to OAuth and email-confirm flows)
  if (raw === 'missing_code' || raw === 'missing_token') {
    return 'That sign-in link looks incomplete. Try again from the login page.';
  }
  if (raw === 'session_failed') {
    return 'We couldn’t finish signing you in. Try again.';
  }

  // Rate limiting
  if (raw.toLowerCase().includes('rate limit') || raw.toLowerCase().includes('too many')) {
    return 'Too many attempts. Wait a minute and try again.';
  }

  // Generic fallback — never expose raw provider strings to the caregiver.
  return 'Something went wrong on our end. Try again, or use a different sign-in method.';
}
