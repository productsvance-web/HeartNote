// Maps short error keys (emitted by our actions/routes) to caregiver-facing copy.
// All callers route raw provider strings through here; nothing else renders error
// text directly. Keeps language consistent and prevents raw Supabase strings from
// leaking into the UI. Per CLAUDE.md rule 5 (grelief register): no chirp, no funeral.
export function friendlyError(key: string): string {
  switch (key) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'email_not_confirmed':
      return 'Check your email to confirm your account before signing in.';
    case 'weak_password':
      return 'That password has appeared in a known data breach. Pick a different one.';

    case 'oauth_cancelled':
      return 'You cancelled signing in with Google. Try again or sign in with your email.';
    case 'oauth_failed':
      return 'We couldn’t finish signing you in with Google. Try again, or use your email and password.';
    case 'oauth_start_failed':
      return 'We couldn’t reach Google. Try again in a moment.';

    case 'reset_session_expired':
      return 'That reset session expired or was already used. Request a new code — they’re valid for 1 hour.';

    case 'missing_code':
      return 'That sign-in link looks incomplete. Try again from the login page.';
    case 'session_failed':
      return 'We couldn’t finish signing you in. Try again.';

    case 'invalid_code':
      return 'That code didn’t match. Check the email and try again.';
    case 'code_expired':
      return 'That code expired. Tap “Resend code” for a fresh one.';

    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';

    case 'delete_failed':
      return 'Could not delete your account. Try again, or contact support.';

    default:
      return 'Something went wrong on our end. Try again, or use a different sign-in method.';
  }
}
