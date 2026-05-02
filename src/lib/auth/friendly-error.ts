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

    case 'oauth_cancelled':
      return 'You cancelled signing in with Google. Try again or sign in with your email.';
    case 'oauth_failed':
      return 'We couldn’t finish signing you in with Google. Try again, or use your email and password.';
    case 'oauth_start_failed':
      return 'We couldn’t reach Google. Try again in a moment.';

    case 'reset_session_expired':
      return 'That reset link expired or was already used. Request a new one — they’re valid for 1 hour.';
    case 'link_expired':
      return 'That link expired or was already used. Request a new one.';

    case 'missing_code':
    case 'missing_token':
      return 'That sign-in link looks incomplete. Try again from the login page.';
    case 'confirm_failed':
      return 'We couldn’t verify that link. Try requesting a new one.';
    case 'session_failed':
      return 'We couldn’t finish signing you in. Try again.';

    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';

    default:
      return 'Something went wrong on our end. Try again, or use a different sign-in method.';
  }
}
