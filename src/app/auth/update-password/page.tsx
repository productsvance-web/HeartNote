import { redirect } from 'next/navigation';
import { Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { UpdatePasswordForm } from './update-password-form';

// Page-side guard: a recovery session exists only if /auth/confirm just succeeded
// with type=recovery. Direct navigation here without one bounces back to login.
export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?error=reset_session_expired');
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-b from-cream to-background">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-3 text-center">
          <div
            className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center shadow-soft"
            style={{
              background:
                'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 60%, white))',
            }}
            aria-hidden
          >
            <Heart size={26} className="text-white" fill="currentColor" />
          </div>
          <h1 className="font-display text-3xl text-foreground">Set a new password</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            You&apos;ll sign in again after this.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-card p-6 animate-fade-up">
          <UpdatePasswordForm />
        </div>
      </div>
    </main>
  );
}
