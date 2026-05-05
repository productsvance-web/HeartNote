'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function deleteAccount(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // createAdminClient() throws synchronously if SUPABASE_SERVICE_ROLE_KEY (or
  // NEXT_PUBLIC_SUPABASE_URL) is missing. Catch and route to the same
  // friendly-error path so the user sees a banner instead of a 500.
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    console.error('[deleteAccount] createAdminClient failed:', e);
    redirect('/me?error=delete_failed');
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error('[deleteAccount] admin.deleteUser failed:', error.message);
    redirect('/me?error=delete_failed');
  }

  await supabase.auth.signOut();
  redirect('/login?notice=account_deleted');
}
