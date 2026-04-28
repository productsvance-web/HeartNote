import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './wizard';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone, onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (profile?.onboarding_completed_at) {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <OnboardingWizard
          email={user.email ?? ''}
          initialDisplayName={profile?.display_name ?? ''}
          initialTimezone={profile?.timezone ?? 'America/New_York'}
        />
      </div>
    </main>
  );
}
