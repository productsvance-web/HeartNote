import Image from 'next/image';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { LoginForm } from './login-form';
import { friendlyError } from '@/lib/auth/friendly-error';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-gradient-to-b from-cream to-background">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <div className="mx-auto rounded-3xl overflow-hidden shadow-card" style={{ width: 192, height: 256 }}>
            <Image
              src="/login-hero.png"
              alt="A caregiver embracing her mother."
              width={384}
              height={512}
              priority
              className="object-cover w-full h-full"
            />
          </div>
          <h1 className="font-display text-4xl text-foreground">HeartNote</h1>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            A quieter way to keep watch over a parent with heart failure.
          </p>
        </div>

        {notice === 'password_updated' && (
          <div
            className="rounded-2xl p-4 flex gap-3 items-start"
            style={{
              background: 'var(--status-good-soft)',
              color: 'var(--status-good-foreground)',
            }}
          >
            <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">
              Password updated. Sign in with your new password.
            </p>
          </div>
        )}

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
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
