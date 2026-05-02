'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const EmailSchema = z.string().email();
const CodeSchema = z.string().regex(/^\d{6}$/);

type ActionResult = { ok: true } | { ok: false; error: string };

export async function resendConfirmation(email: string): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: 'invalid_email' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate') || msg.includes('too many')) return { ok: false, error: 'rate_limited' };
    // "Already confirmed" lands here too — the user can just sign in.
    return { ok: false, error: 'resend_failed' };
  }
  return { ok: true };
}

// Verify the 6-digit code from the signup confirmation email. On success,
// Supabase establishes a session and we route by onboarding state.
export async function verifyEmailCode(email: string, code: string): Promise<ActionResult | void> {
  const emailParsed = EmailSchema.safeParse(email);
  if (!emailParsed.success) return { ok: false, error: 'invalid_email' };
  const codeParsed = CodeSchema.safeParse(code);
  if (!codeParsed.success) return { ok: false, error: 'invalid_code' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: emailParsed.data,
    token: codeParsed.data,
    type: 'email',
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expired')) return { ok: false, error: 'code_expired' };
    if (msg.includes('rate') || msg.includes('too many')) return { ok: false, error: 'rate_limited' };
    return { ok: false, error: 'invalid_code' };
  }

  // redirect() throws NEXT_REDIRECT — keep it outside try/catch.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('onboarding_completed_at').eq('id', user.id).single()
    : { data: null };
  redirect(profile?.onboarding_completed_at ? '/dashboard' : '/onboarding');
}
