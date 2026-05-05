'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';

const EmailSchema = z.string().email();

// Sends a 6-digit code + magic link to the user's email. Idempotent on the
// caller side — submitting the same email twice rapidly is safe; Supabase rate-
// limits and we surface the 429 as a friendly "we just sent one" via rate_limited.
// Existing and new users share this path: shouldCreateUser:true creates on demand.
export async function sendOtp(formData: FormData): Promise<void> {
  const raw = ((formData.get('email') as string | null) ?? '').trim().toLowerCase();
  const parsed = EmailSchema.safeParse(raw);
  if (!parsed.success) {
    redirect('/login?error=otp_send_failed');
  }
  const email = parsed.data;

  const supabase = await createClient();
  const origin = resolveOrigin(await headers());
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('rate') || msg.includes('too many')) {
      redirect('/login?error=rate_limited');
    }
    redirect('/login?error=otp_send_failed');
  }

  redirect(`/auth/verify?email=${encodeURIComponent(email)}`);
}
