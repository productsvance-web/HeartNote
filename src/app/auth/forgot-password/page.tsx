import Link from 'next/link';
import { Heart, AlertCircle } from 'lucide-react';
import { ForgotPasswordForm } from './forgot-password-form';
import { friendlyError } from '@/lib/auth/friendly-error';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; error?: string }>;
}) {
  const { email, error } = await searchParams;

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
          <h1 className="font-display text-3xl text-foreground">Reset your password</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            We&apos;ll email you a 6-digit code to set a new password.
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
          <ForgotPasswordForm initialEmail={email ?? ''} />
        </div>

        <p className="text-sm text-muted-foreground text-center">
          <Link href="/login" className="font-medium text-foreground hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
