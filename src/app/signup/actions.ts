'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';
import { resolveOrigin } from '@/lib/auth/origin';

const SignUpSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`),
});

type ActionResult = { ok: false; error: string };

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
  const origin = resolveOrigin(await headers());

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

  // Supabase signals "email already in use" by returning a user with empty identities[].
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    // Existing account. Resend succeeds for unconfirmed users (good UX), errors for
    // confirmed ones (route to honest "email exists" message per decision #13).
    const { error: resendErr } = await supabase.auth.resend({
      type: 'signup',
      email: parsed.data.email,
      options: { emailRedirectTo: `${origin}/auth/confirm` },
    });
    if (resendErr) return { ok: false, error: 'email_exists' };
    redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
  }

  redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}
