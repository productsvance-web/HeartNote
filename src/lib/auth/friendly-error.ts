// Maps short error keys (emitted by our actions/routes) to caregiver-facing copy.
// All callers route raw provider strings through here; nothing else renders error
// text directly. Keeps language consistent and prevents raw Supabase strings from
// leaking into the UI. Per CLAUDE.md rule 5 (grelief register): no chirp, no funeral.
export function friendlyError(key: string): string {
  switch (key) {
    case 'oauth_cancelled':
      return 'You cancelled signing in with Google. Try again or sign in with your email.';
    case 'oauth_failed':
      return 'We couldn’t finish signing you in with Google. Try again, or use your email.';
    case 'oauth_start_failed':
      return 'We couldn’t reach Google. Try again in a moment.';

    case 'missing_code':
      return 'That sign-in link looks incomplete. Try again from the login page.';
    case 'session_failed':
      return 'We couldn’t finish signing you in. Try again.';

    case 'otp_send_failed':
      return 'We couldn’t send the sign-in email. Check the address and try again.';
    case 'invalid_code':
      return 'That code didn’t match. Check the email and try again.';
    case 'code_expired':
      return 'That code expired. Tap “Resend code” for a fresh one.';
    case 'link_expired':
      return 'That sign-in link expired or was already used. Request a new one.';

    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';

    case 'delete_failed':
      return 'Could not delete your account. Try again, or contact support.';

    default:
      return 'Something went wrong on our end. Try again, or use a different sign-in method.';
  }
}
