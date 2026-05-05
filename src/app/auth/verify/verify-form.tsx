'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { verifyCode, resendCode } from './actions';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/auth/friendly-error';

const RESEND_COOLDOWN_SECONDS = 60;

function VerifySubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full rounded-full px-6 py-4 font-semibold text-base text-primary-foreground shadow-soft active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background:
          'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
      }}
    >
      {pending ? 'Verifying…' : 'Verify code'}
    </button>
  );
}

export function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const submittedRef = useRef(false);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, startResend] = useTransition();

  // Same-tab sign-in: if the user taps the magic link in another tab of the
  // same browser, the cookie store updates, the auth listener fires SIGNED_IN
  // here, and this tab routes to the destination. /dashboard server-side
  // redirects to /onboarding for users who haven't finished that flow.
  useEffect(() => {
    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session && !submittedRef.current) {
        submittedRef.current = true;
        router.replace('/dashboard');
      }
    });
    return () => subscription.unsubscribe();
  }, [router]);

  // Countdown for the resend button. Functional updater avoids stale-closure
  // reads of `cooldown`; the effect re-runs only when cooldown crosses zero.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  function handleCodeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (next.length === 6 && !submittedRef.current) {
      submittedRef.current = true;
      formRef.current?.requestSubmit();
    }
  }

  function handleResend() {
    if (cooldown > 0 || isResending) return;
    setResendError(null);
    startResend(async () => {
      const fd = new FormData();
      fd.append('email', email);
      const result = await resendCode(fd);
      if (result.ok) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setCode('');
        submittedRef.current = false;
      } else {
        setResendError(result.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} action={verifyCode} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">6-digit code</span>
          <input
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={handleCodeChange}
            aria-label="6-digit code"
            placeholder="123456"
            className="input text-center tracking-[0.5em] text-2xl font-medium"
          />
        </label>
        <VerifySubmit disabled={code.length !== 6} />
      </form>

      <div className="text-center text-sm text-muted-foreground space-y-1">
        <button
          type="button"
          onClick={handleResend}
          disabled={cooldown > 0 || isResending}
          className="underline disabled:no-underline disabled:opacity-60"
        >
          {cooldown > 0
            ? `Resend in ${cooldown}s`
            : isResending
            ? 'Sending…'
            : 'Resend code'}
        </button>
        {resendError && (
          <p className="text-destructive">{friendlyError(resendError)}</p>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        Wrong email?{' '}
        <Link href="/login" className="underline">
          Start over
        </Link>
      </p>
    </div>
  );
}
