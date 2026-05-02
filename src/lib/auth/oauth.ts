'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from './origin';

// Shared OAuth start. Forms bind the failure-redirect path:
//   <form action={signInWithGoogle.bind(null, '/login')}>
// so an OAuth-start failure on /signup bounces back to /signup, not /login.
export async function signInWithGoogle(failureRedirect: string): Promise<void> {
  const supabase = await createClient();
  const origin = resolveOrigin(await headers());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data?.url) {
    redirect(`${failureRedirect}?error=oauth_start_failed`);
  }
  redirect(data.url);
}
