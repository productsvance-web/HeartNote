'use client';

import { useEffect, useState, useTransition } from 'react';
import { resendConfirmation, verifyEmailCode } from './actions';
import { OtpInput } from '@/components/heartnote/OtpInput';

const RESEND_COOLDOWN_SECONDS = 30;

export function CheckEmailForm({ email }: { email: string }) {
  const [code, setCode] = useState('');
  const [errorText, setErrorText] = useState('');
  const [resendStatus, setResendStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [resendError, setResendError] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isVerifying, startVerify] = useTransition();
  const [isResending, startResend] = useTransition();

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const id = setInterval(() => {
      setSecondsRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsRemaining]);

  const onCooldown = secondsRemaining > 0;

  function submitCode(submitted: string) {
    if (submitted.length !== 6 || isVerifying) return;
    setErrorText('');
    startVerify(async () => {
      const result = await verifyEmailCode(email, submitted);
      // result is undefined on success (action redirects). Only reach here on failure.
      if (result && !result.ok) {
        setErrorText(messageFor(result.error));
        setCode('');
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitCode(code);
  }

  function onResend() {
    setResendError('');
    startResend(async () => {
      const result = await resendConfirmation(email);
      if (result.ok) {
        setResendStatus('sent');
        setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
      } else {
        setResendStatus('error');
        setResendError(
          result.error === 'rate_limited'
            ? 'Too many attempts. Wait a minute and try again.'
            : 'We couldn’t resend the email. If it doesn’t arrive, try signing in — your account may already be confirmed.'
        );
      }
    });
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">Verification code</span>
          <OtpInput
            name="code"
            value={code}
            onChange={setCode}
            onComplete={submitCode}
            disabled={isVerifying}
            autoFocus
          />
        </label>
        <button
          type="submit"
          disabled={isVerifying || code.length !== 6}
          className="w-full rounded-full px-6 py-4 font-semibold text-base text-primary-foreground shadow-soft active:scale-[0.98] transition disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background:
              'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
          }}
        >
          {isVerifying ? 'Verifying…' : 'Verify code'}
        </button>
        {errorText && (
          <p className="text-sm text-destructive text-center">{errorText}</p>
        )}
      </form>

      <div className="text-center space-y-2">
        <p className="text-xs text-muted-foreground">Didn&apos;t get the email?</p>
        <button
          type="button"
          onClick={onResend}
          disabled={isResending || onCooldown}
          className="text-sm font-medium text-foreground underline disabled:no-underline disabled:text-muted-foreground disabled:cursor-not-allowed"
        >
          {isResending ? 'Sending…' : onCooldown ? `Resend in ${secondsRemaining}s` : 'Resend code'}
        </button>
        {resendStatus === 'sent' && !resendError && (
          <p className="text-xs text-muted-foreground">Sent. Give it a minute to arrive.</p>
        )}
        {resendStatus === 'error' && resendError && (
          <p className="text-xs text-destructive">{resendError}</p>
        )}
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
