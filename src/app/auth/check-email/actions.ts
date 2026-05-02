'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';

const EmailSchema = z.string().email();

type ActionResult = { ok: true } | { ok: false; error: string };

export async function resendConfirmation(email: string): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: 'invalid_email' };

  const origin = resolveOrigin(await headers());
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate') || msg.includes('too many')) return { ok: false, error: 'rate_limited' };
    // "Already confirmed" lands here too — the user can just sign in.
    return { ok: false, error: 'resend_failed' };
  }
  return { ok: true };
}
