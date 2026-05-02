'use server';

import { z } from 'zod';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';
import { RECOVERY_COOKIE } from '@/lib/auth/recovery-cookie';

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
  // Belt-and-suspenders against the page guard: enforce the recovery flag here
  // too, in case the page-side check was bypassed (caching, race, direct POST).
  const cookieStore = await cookies();
  if (!cookieStore.get(RECOVERY_COOKIE)) {
    redirect('/login?error=reset_session_expired');
  }

  const parsed = UpdatePasswordSchema.safeParse({
    password: (formData.get('password') as string | null) ?? '',
    confirm: (formData.get('confirm') as string | null) ?? '',
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your password.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?error=reset_session_expired');
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, error: 'update_failed' };
  }

  // Clear the recovery flag and force a fresh sign-in. Invalidates the
  // recovery-session cookie so a stolen reset link can't be reused.
  cookieStore.delete(RECOVERY_COOKIE);
  await supabase.auth.signOut();
  redirect('/login?notice=password_updated');
}
