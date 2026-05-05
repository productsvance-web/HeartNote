'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';

const VerifySchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits.'),
});

const ResendSchema = z.object({
  email: z.string().email(),
});

// Verifies the 6-digit code. On success: redirects to /dashboard or /onboarding
// based on profile state. On failure: redirects back to /auth/verify with an
// error key so the page renders friendly copy.
export async function verifyCode(formData: FormData): Promise<void> {
  const rawEmail = ((formData.get('email') as string | null) ?? '').trim().toLowerCase();
  const rawCode = ((formData.get('code') as string | null) ?? '').trim();
  const emailValid = z.string().email().safeParse(rawEmail).success;
  if (!emailValid) {
    // The hidden email input was tampered or empty. Sending the user back to
    // the verify page with a code error would be misleading — start over.
    redirect('/login?error=otp_send_failed');
  }
  const parsed = VerifySchema.safeParse({ email: rawEmail, code: rawCode });
  if (!parsed.success) {
    redirect(`/auth/verify?email=${encodeURIComponent(rawEmail)}&error=invalid_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.code,
    type: 'email',
  });

  if (error) {
    const msg = error.message.toLowerCase();
    const key = msg.includes('expired')
      ? 'code_expired'
      : msg.includes('rate') || msg.includes('too many')
      ? 'rate_limited'
      : 'invalid_code';
    redirect(`/auth/verify?email=${encodeURIComponent(parsed.data.email)}&error=${key}`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?error=session_failed');
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .single();
  redirect(profile?.onboarding_completed_at ? '/dashboard' : '/onboarding');
}

type ResendResult = { ok: true } | { ok: false; error: string };

// Re-sends the OTP email. Client-side enforces a 60s cooldown via disabled
// button + countdown; this action exists for the click that survives the
// disabled state (older browsers, accessibility tools). Supabase's own rate
// limit is the backstop — surfaced as `rate_limited`.
export async function resendCode(formData: FormData): Promise<ResendResult> {
  const rawEmail = ((formData.get('email') as string | null) ?? '').trim().toLowerCase();
  const parsed = ResendSchema.safeParse({ email: rawEmail });
  if (!parsed.success) {
    return { ok: false, error: 'otp_send_failed' };
  }

  const supabase = await createClient();
  const origin = resolveOrigin(await headers());
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate') || msg.includes('too many')) {
      return { ok: false, error: 'rate_limited' };
    }
    return { ok: false, error: 'otp_send_failed' };
  }

  return { ok: true };
}
