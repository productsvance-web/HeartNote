'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { adminClient } from '@/lib/supabase/admin';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[deleteAccount] admin.deleteUser failed:', error.message);
    redirect('/me?error=delete_failed');
  }

  await supabase.auth.signOut();
  redirect('/login?notice=account_deleted');
}
