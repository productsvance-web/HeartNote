'use server';

import { z } from 'zod';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password.'),
});

type ActionResult = { ok: false; error: string };

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}

export async function signInWithPassword(formData: FormData): Promise<ActionResult | void> {
  const parsed = SignInSchema.safeParse({
    email: (formData.get('email') as string | null)?.trim() ?? '',
    password: (formData.get('password') as string | null) ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: 'Enter a valid email and password.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('email not confirmed')) return { ok: false, error: 'email_not_confirmed' };
    if (msg.includes('rate') || msg.includes('too many')) return { ok: false, error: 'rate_limited' };
    return { ok: false, error: 'invalid_credentials' };
  }

  // Route by onboarding state. redirect() throws NEXT_REDIRECT — must be outside try/catch.
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('onboarding_completed_at').eq('id', user.id).single()
    : { data: null };
  redirect(profile?.onboarding_completed_at ? '/dashboard' : '/onboarding');
}

// OAuth start. Form posts to this action; we ask Supabase for the provider URL,
// then 303-redirect the browser to Google.
export async function signInWithGoogle(): Promise<void> {
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
