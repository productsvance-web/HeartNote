import { Heart, Mail } from 'lucide-react';
import Link from 'next/link';
import { ResendButton } from './check-email-actions';

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const display = email?.trim() || 'your email';

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
          <h1 className="font-display text-3xl text-foreground">Check your email</h1>
        </div>

        <div className="bg-card rounded-3xl shadow-card p-6 space-y-5 animate-fade-up">
          <div
            className="mx-auto h-12 w-12 rounded-full flex items-center justify-center"
            style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
            aria-hidden
          >
            <Mail size={20} />
          </div>
          <p className="text-sm text-muted-foreground text-center leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="font-medium text-foreground">{display}</span>.<br />
            Open it on this device to finish signing in.
          </p>
          {email && (
            <div className="flex justify-center">
              <ResendButton email={email} />
            </div>
          )}
        </div>

        <p className="text-sm text-muted-foreground text-center">
          Wrong email?{' '}
          <Link href="/signup" className="font-medium text-foreground hover:underline">
            Start over
          </Link>
        </p>
      </div>
    </main>
  );
}
