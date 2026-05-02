'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';

const SignUpSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`),
});

type ActionResult = { ok: false; error: string };

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

// TODO(post-resend): when transactional email (Resend or equivalent) is wired for
// family-share alerts, flip this action to enumeration-safe: always return the
// generic check-email response, send a "we noticed" email to existing accounts.
// See docs/plans/login-v1.md decision #13.
export async function signUpWithPassword(formData: FormData): Promise<ActionResult | void> {
  const parsed = SignUpSchema.safeParse({
    email: (formData.get('email') as string | null)?.trim() ?? '',
    password: (formData.get('password') as string | null) ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your email and password.' };
  }

  const supabase = await createClient();
  const origin = await resolveOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate') || msg.includes('too many')) return { ok: false, error: 'rate_limited' };
    return { ok: false, error: 'signup_failed' };
  }

  // Supabase signals "email already in use" by returning a user object with an empty
  // identities array (documented obfuscation pattern). We unpack that here.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    // Existing account. Try resend — succeeds for unconfirmed users (good UX),
    // errors for confirmed ones (route to honest "email exists" message).
    const { error: resendErr } = await supabase.auth.resend({
      type: 'signup',
      email: parsed.data.email,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (resendErr) {
      // Confirmed user — show honest error per decision #13.
      return { ok: false, error: 'email_exists' };
    }
    // Unconfirmed user — fresh confirmation email is on the way.
    redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
  }

  redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

// Same OAuth start as /login — re-exported so /signup imports from one place
// and the action stays close to its form.
export async function signUpWithGoogle(): Promise<void> {
  const supabase = await createClient();
  const origin = await resolveOrigin();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });

  if (error || !data?.url) {
    redirect(`/login?error=${encodeURIComponent('oauth_start_failed')}`);
  }
  redirect(data.url);
}
