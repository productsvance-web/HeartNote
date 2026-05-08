// Login — matches design-system designs/screens.jsx LoginScreen layout.
// Top 58% photograph with rounded bottom corners + dark scrim; wordmark
// at top of the photo; eyebrow pill + Fraunces "How is mom today?"
// headline at bottom of the photo on the dark wash; sign-in card on
// cream below, overlapping the bottom of the photo by ~44px.
//
// Auth flow stays Google OAuth + email OTP — the design-system mock
// shows email/password, but production keeps the real flow.

import Image from 'next/image';
import { redirect } from 'next/navigation';
import { AlertCircle, CheckCircle2, Heart } from 'lucide-react';
import { LoginForm } from './login-form';
import { friendlyError } from '@/lib/auth/friendly-error';
import { createClient } from '@/lib/supabase/server';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;

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
    <main
      className="relative isolate min-h-dvh overflow-hidden flex flex-col"
      style={{ background: 'var(--cream)' }}
    >
      {/* Photograph band — top 58% of the screen with rounded bottom corners */}
      <div
        className="relative w-full overflow-hidden shrink-0"
        style={{
          height: '58dvh',
          minHeight: 430,
          borderBottomLeftRadius: 36,
          borderBottomRightRadius: 36,
        }}
      >
        <Image
          src="/login-hero.png"
          alt="A caregiver embracing her mother."
          fill
          priority
          sizes="100vw"
          className="object-cover"
          style={{ objectPosition: '50% 35%' }}
        />

        {/* Dark scrim — vignettes the top + bottom of the photo for legibility */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(28,30,32,0.55) 0%, rgba(28,30,32,0.10) 28%, rgba(28,30,32,0.10) 50%, rgba(28,30,32,0.65) 100%)',
          }}
        />
        {/* Warm sage vignette pulled in from the bottom corners */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 70% at 50% 100%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 55%)',
            mixBlendMode: 'soft-light',
          }}
        />

        {/* Wordmark at top */}
        <div className="relative z-10 px-6 pt-6">
          <div
            className="inline-flex items-center gap-2 font-display text-[18px] text-white"
            style={{ fontWeight: 500, letterSpacing: '-0.01em' }}
          >
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded-full"
              style={{ background: 'var(--primary)', color: '#FFF' }}
            >
              <Heart size={13} fill="currentColor" strokeWidth={0} />
            </span>
            HeartNote
          </div>
        </div>

        {/* Eyebrow pill + Fraunces headline at the bottom */}
        <div className="absolute left-0 right-0 bottom-0 z-10 px-7 pb-8">
          <div
            className="inline-flex items-center gap-2 px-2.5 py-1.5 mb-3.5 rounded-full text-[11px] font-medium uppercase text-white"
            style={{
              letterSpacing: '0.06em',
              background: 'rgba(255,255,255,0.16)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            <span
              aria-hidden
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: 'var(--primary)' }}
            />
            For caregivers of a parent with CHF
          </div>
          <h1
            className="font-display text-white"
            style={{
              fontSize: '2.625rem',
              lineHeight: 1.02,
              letterSpacing: '-0.025em',
              fontWeight: 500,
              textShadow: '0 2px 24px rgba(0,0,0,0.35)',
              margin: 0,
            }}
          >
            How is <em className="italic font-normal">mom</em>
            <br />
            today?
          </h1>
          <p
            className="mt-2.5 text-[14.5px] leading-relaxed max-w-[32ch]"
            style={{ color: 'rgba(255,255,255,0.92)' }}
          >
            A quieter way to keep watch — built around a 30-second voice log.
          </p>
        </div>
      </div>

      {/* Sign-in card on cream, overlapping the bottom of the photo by 44px */}
      <div className="flex-1 px-5 pb-6 flex flex-col gap-4">
        {notice === 'account_deleted' && (
          <div
            className="mt-4 rounded-2xl p-4 flex gap-3 items-start"
            style={{
              background: 'var(--status-good-soft)',
              color: 'var(--status-good-foreground)',
            }}
          >
            <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed">Account deleted. Your data is gone.</p>
          </div>
        )}

        {error && (
          <div
            className="mt-4 rounded-2xl p-4 flex gap-3 items-start"
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
          className="relative rounded-3xl p-5 animate-fade-up"
          style={{
            background: 'color-mix(in oklab, var(--card) 92%, transparent)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-soft)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            marginTop: -44,
          }}
        >
          <LoginForm />
        </div>

        <p
          className="text-center text-[11.5px] leading-relaxed text-muted-foreground px-2 mt-auto"
          style={{ paddingTop: 8 }}
        >
          HeartNote isn&rsquo;t a replacement for medical care. It helps you notice patterns
          earlier — your cardiologist makes the call.
        </p>
      </div>
    </main>
  );
}
