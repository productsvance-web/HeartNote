'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

const SignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Enter your password.'),
});

type ActionResult = { ok: false; error: string };

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
