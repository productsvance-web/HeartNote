import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { VerifyForm } from './verify-form';
import { friendlyError } from '@/lib/auth/friendly-error';
import { createClient } from '@/lib/supabase/server';

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email, error } = await searchParams;
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) redirect('/login');

  // If a session is already established (e.g. via the magic link in another
  // tab racing the user's typing), don't show the code form — route through.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed_at')
      .eq('id', user.id)
      .single();
    redirect(profile?.onboarding_completed_at ? '/dashboard' : '/onboarding');
  }

  return (
    <main className="min-h-dvh flex flex-col justify-end md:items-center md:justify-center px-5 pt-10 pb-6 bg-gradient-to-b from-cream to-background">
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-2 text-center">
          <h1 className="font-display text-3xl text-foreground">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a code to <span className="font-medium text-foreground">{trimmed}</span> — type it below or tap the link in your email.
          </p>
        </div>

        {error && (
          <div
            className="rounded-2xl p-4 flex gap-3 items-start"
            style={{
              background: 'var(--status-alert-soft)',
              color: 'var(--status-alert-foreground)',
            }}
          >
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">{friendlyError(error)}</p>
          </div>
        )}

        <div className="bg-card rounded-3xl shadow-card p-6 animate-fade-up">
          <VerifyForm email={trimmed} />
        </div>
      </div>
    </main>
  );
}
