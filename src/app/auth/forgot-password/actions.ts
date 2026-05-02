'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth/recovery-cookie';

const EmailSchema = z.string().email();
const CodeSchema = z.string().regex(/^\d{6}$/);

type ActionResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: 'invalid_email' };

  const supabase = await createClient();
  // Supabase's resetPasswordForEmail does not reveal whether the account exists —
  // safe to always treat as success in the UI.
  await supabase.auth.resetPasswordForEmail(parsed.data);
  return { ok: true };
}

// Verify the 6-digit recovery code. On success, set the short-lived recovery
// flag cookie and route to the password-set form. The cookie is what
// /auth/update-password gates on — a normally-signed-in user without it
// gets bounced.
export async function verifyRecoveryCode(email: string, code: string): Promise<ActionResult | void> {
  const emailParsed = EmailSchema.safeParse(email);
  if (!emailParsed.success) return { ok: false, error: 'invalid_email' };
  const codeParsed = CodeSchema.safeParse(code);
  if (!codeParsed.success) return { ok: false, error: 'invalid_code' };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: emailParsed.data,
    token: codeParsed.data,
    type: 'recovery',
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expired')) return { ok: false, error: 'code_expired' };
    if (msg.includes('rate') || msg.includes('too many')) return { ok: false, error: 'rate_limited' };
    return { ok: false, error: 'invalid_code' };
  }

  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_COOKIE, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
    path: '/auth/update-password',
  });

  redirect('/auth/update-password');
}
