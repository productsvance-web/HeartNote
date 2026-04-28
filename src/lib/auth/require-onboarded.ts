import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Server-component helper: enforce signed-in + onboarded, return user + profile.
// Centralizes the auth gate every protected page repeats.
export async function requireOnboarded() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  return { supabase, user, profile };
}
