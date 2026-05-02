'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

const EmailSchema = z.string().email();

type ActionResult = { ok: true } | { ok: false; error: string };

export async function resendConfirmation(email: string): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: 'invalid_email' };

  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const origin = `${proto}://${host}`;

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
