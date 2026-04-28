'use server';

import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';

const EmailSchema = z.string().email();

export async function sendMagicLink(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = EmailSchema.safeParse(email);
  if (!parsed.success) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get('origin') ?? 'http://localhost:3000';

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
