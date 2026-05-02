'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';

const UpdatePasswordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Passwords don’t match.',
    path: ['confirm'],
  });

type ActionResult = { ok: false; error: string };

export async function updatePassword(formData: FormData): Promise<ActionResult | void> {
  const parsed = UpdatePasswordSchema.safeParse({
    password: (formData.get('password') as string | null) ?? '',
    confirm: (formData.get('confirm') as string | null) ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your password.' };
  }

  const supabase = await createClient();
  // Require an active recovery session — the verifyOtp({type:'recovery'}) on /auth/confirm
  // sets one. If absent, the page-side guard already redirected; this is belt-and-suspenders.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?error=reset_session_expired');
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, error: 'update_failed' };
  }

  // Force a fresh sign-in with the new password — invalidates the recovery-session cookie
  // so a stolen reset link can't keep acting on the account.
  await supabase.auth.signOut();
  redirect('/login?notice=password_updated');
}
