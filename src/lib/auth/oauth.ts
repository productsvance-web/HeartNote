'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from './origin';

// Shared OAuth start. Forms bind the failure-redirect path:
//   <form action={signInWithGoogle.bind(null, '/login')}>
// so an OAuth-start failure on /signup bounces back to /signup, not /login.
//
// Explicit `scopes` defends against Google Workspace tenants that don't include
// the email scope by default — without it, those users would sign in but Supabase
// wouldn't have an email to attach the identity to.
export async function signInWithGoogle(failureRedirect: string): Promise<void> {
  const supabase = await createClient();

  // Clear any prior local session before initiating a new OAuth round-trip.
  // Closes the cookie-bleed where account A's cookies persist when the user
  // picks account B on Google's chooser. `scope: 'local'` only deletes
  // cookies — no network round-trip to revoke the refresh token, since the
  // new OAuth will overwrite cookies anyway. If signOut throws (e.g. no
  // existing session, or transient cookie-store failure), log and continue:
  // the failure is benign because the OAuth round-trip overwrites cookies on
  // success, and blocking sign-in on signOut failure would lock users out.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.error('[signInWithGoogle] pre-OAuth signOut failed:', err);
  }

  const origin = resolveOrigin(await headers());
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: 'openid email profile',
    },
  });
  if (error || !data?.url) {
    redirect(`${failureRedirect}?error=oauth_start_failed`);
  }
  redirect(data.url);
}
