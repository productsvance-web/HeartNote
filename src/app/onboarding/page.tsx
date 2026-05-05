import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { OnboardingWizard } from './wizard';
import { DeleteAccountLink } from '../me/delete-account-button';
import { signOut } from '../me/actions';

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone, onboarding_completed_at')
    .eq('id', user.id)
    .single();

  if (profile?.onboarding_completed_at) redirect('/dashboard');

  return (
    <main className="min-h-screen bg-gradient-to-b from-cream to-background flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-md">
        <div className="bg-card rounded-3xl shadow-card p-6 animate-fade-up">
          <OnboardingWizard
            email={user.email ?? ''}
            initialDisplayName={profile?.display_name ?? ''}
            initialTimezone={profile?.timezone ?? 'America/New_York'}
          />
        </div>
        {/* Sign out is the primary escape (low-stakes, reversible). Delete is
            secondary, visually de-emphasized, and lives below. Two visually
            equivalent links here was the bug class this PR is closing. */}
        <div className="mt-4 text-center">
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm font-medium text-foreground underline"
            >
              Not you? Sign out
            </button>
          </form>
          <div className="mt-3">
            <DeleteAccountLink email={user.email ?? ''} />
          </div>
        </div>
      </div>
    </main>
  );
}
