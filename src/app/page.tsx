import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Root: route by session state. OAuth callbacks land at /auth/callback,
// email-link callbacks at /auth/confirm — neither bounces through here.
export default async function Home() {
  const supabase = await createClient();
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
