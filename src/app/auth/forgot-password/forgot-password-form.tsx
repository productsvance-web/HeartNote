'use client';

import { useEffect, useState, useTransition } from 'react';
import { requestPasswordReset, verifyRecoveryCode } from './actions';
import { OtpInput } from '@/components/heartnote/OtpInput';

const RESEND_COOLDOWN_SECONDS = 30;

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isResending, startResend] = useTransition();

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const id = setInterval(() => {
      setSecondsRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsRemaining]);

  const onCooldown = secondsRemaining > 0;

  function onEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submittedEmail = ((formData.get('email') as string | null) ?? email).trim();
    if (!submittedEmail) {
      setErrorText('Enter your email.');
      return;
    }
    setEmail(submittedEmail);
    setErrorText('');
    startTransition(async () => {
      const result = await requestPasswordReset(submittedEmail);
      if (result.ok) {
        setStep('code');
        setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
      } else {
        setErrorText(
          result.error === 'invalid_email'
            ? 'Enter a valid email address.'
            : 'Something went wrong. Try again.'
        );
      }
    });
  }

  function submitCode(submitted: string) {
    if (submitted.length !== 6 || isPending) return;
    setErrorText('');
    startTransition(async () => {
      const result = await verifyRecoveryCode(email, submitted);
      // result is undefined on success (action redirects). Only reach here on failure.
      if (result && !result.ok) {
        setErrorText(messageFor(result.error));
        setCode('');
      }
    });
  }

  function onCodeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitCode(code);
  }

  function onResend() {
    setErrorText('');
    startResend(async () => {
      const result = await requestPasswordReset(email);
      if (result.ok) {
        setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
      } else {
        setErrorText('We couldn’t resend the code. Try again.');
      }
    });
  }

  if (step === 'email') {
    return (
      <form onSubmit={onEmailSubmit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-full px-6 py-4 font-semibold text-base text-primary-foreground shadow-soft active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background:
              'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
          }}
        >
          {isPending ? 'Sending…' : 'Send reset code'}
        </button>
        {errorText && (
          <p className="text-sm text-destructive text-center">{errorText}</p>
        )}
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground text-center leading-relaxed">
        If you have a HeartNote account, a 6-digit code is on its way to{' '}
        <span className="font-medium text-foreground">{email}</span>. Enter it below.
      </p>
      <form onSubmit={onCodeSubmit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Reset code</span>
          <OtpInput
            name="code"
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={isPending}
            autoFocus
          />
        </label>
        <button
          type="submit"
          disabled={isPending || code.length !== 6}
          className="w-full rounded-full px-6 py-4 font-semibold text-base text-primary-foreground shadow-soft active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background:
              'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
          }}
        >
          {isPending ? 'Verifying…' : 'Continue'}
        </button>
        {errorText && (
          <p className="text-sm text-destructive text-center">{errorText}</p>
        )}
      </form>

      <div className="text-center space-y-1">
        <p className="text-xs text-muted-foreground">Didn&apos;t get the email?</p>
        <button
          type="button"
          onClick={onResend}
          disabled={isResending || onCooldown}
          className="text-sm font-medium text-foreground underline disabled:no-underline disabled:text-muted-foreground disabled:cursor-not-allowed"
        >
          {isResending ? 'Sending…' : onCooldown ? `Resend in ${secondsRemaining}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}

function messageFor(key: string): string {
  switch (key) {
    case 'invalid_code':
      return 'That code didn’t match. Check the email and try again.';
    case 'code_expired':
      return 'That code expired. Tap “Resend code” for a fresh one.';
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.';
    default:
      return 'We couldn’t verify that code. Try again, or resend.';
  }
}
