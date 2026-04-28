import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Handles three cases:
// 1. ?code=... in the URL (Supabase magic-link callback that landed at root
//    instead of /auth/callback — happens when site_url's path overrides our
//    emailRedirectTo). Exchange the code for a session, then route by
//    onboarding state.
// 2. Already signed in → route by onboarding state.
// 3. Not signed in, no code → /login.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error_description?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  if (params.error_description) {
    redirect(`/login?error=${encodeURIComponent(params.error_description)}`);
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }
    // Fall through to the onboarding-state routing below now that we have a session.
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (!profile?.onboarding_completed_at) redirect('/onboarding');
  redirect('/dashboard');
}
