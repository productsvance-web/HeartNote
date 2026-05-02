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
    <main className="relative isolate min-h-dvh overflow-hidden bg-background">
      {/* Full-bleed hero photo. object-cover with center positioning keeps the
          subjects' faces in frame across phone and desktop aspect ratios.
          `isolate` on the parent ensures the negative z-index stays within
          <main>'s stacking context (otherwise it falls behind the bg fill). */}
      <Image
        src="/login-hero.png"
        alt="A caregiver embracing her mother."
        fill
        priority
        sizes="100vw"
        className="object-cover object-center -z-10"
      />

      {/* Soft cream wash at the bottom so the form panel reads cleanly against
          any image variation. Top stays clear so the photo is unobstructed. */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/3 -z-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0) 0%, color-mix(in oklab, var(--cream) 40%, transparent) 35%, var(--cream) 75%)',
        }}
      />

      <div className="relative min-h-dvh flex flex-col justify-end md:items-center md:justify-center px-5 pt-10 pb-6">
        <div className="w-full max-w-md space-y-4">
          <div className="space-y-2 text-center">
            <h1 className="font-display text-4xl text-foreground drop-shadow-sm">HeartNote</h1>
            <p className="text-sm text-foreground/80 max-w-sm mx-auto">
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

          {notice === 'account_deleted' && (
            <div
              className="rounded-2xl p-4 flex gap-3 items-start"
              style={{
                background: 'var(--status-good-soft)',
                color: 'var(--status-good-foreground)',
              }}
            >
              <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm leading-relaxed">
                Account deleted. Your data is gone.
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

          <div
            className="rounded-3xl shadow-card p-5 animate-fade-up backdrop-blur-md"
            style={{ background: 'color-mix(in oklab, var(--card) 92%, transparent)' }}
          >
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  );
}
