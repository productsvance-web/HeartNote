import { Heart } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckEmailForm } from './check-email-actions';

// OTP-only confirmation: page renders the 6-digit code form. The email param
// is required — without it we can't call verifyOtp, so bounce to signup.
export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const trimmed = email?.trim();
  if (!trimmed) redirect('/signup');

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
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            We sent a 6-digit code to{' '}
            <span className="font-medium text-foreground">{trimmed}</span>. Enter it below to finish signing in.
          </p>
        </div>

        <div className="bg-card rounded-3xl shadow-card p-6 animate-fade-up">
          <CheckEmailForm email={trimmed} />
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
