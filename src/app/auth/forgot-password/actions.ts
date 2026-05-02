'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';

const EmailSchema = z.string().email();

type ActionResult = { ok: true } | { ok: false; error: string };

export async function requestPasswordReset(email: string): Promise<ActionResult> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) return { ok: false, error: 'invalid_email' };

  const origin = resolveOrigin(await headers());
  const supabase = await createClient();
  // Supabase's resetPasswordForEmail does not reveal whether the account exists —
  // safe to always treat as success in the UI.
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/confirm`,
  });
  return { ok: true };
}
