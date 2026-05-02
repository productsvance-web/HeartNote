'use client';

import { useEffect, useState, useTransition } from 'react';
import { resendConfirmation } from './actions';

const RESEND_COOLDOWN_SECONDS = 30;

export function ResendButton({ email }: { email: string }) {
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Tick the cooldown down once per second; clean up when we hit zero or unmount.
  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const id = setInterval(() => {
      setSecondsRemaining((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [secondsRemaining]);

  const onCooldown = secondsRemaining > 0;

  function onClick() {
    setErrorText('');
    startTransition(async () => {
      const result = await resendConfirmation(email);
      if (result.ok) {
        setStatus('sent');
        setSecondsRemaining(RESEND_COOLDOWN_SECONDS);
      } else {
        setStatus('error');
        setErrorText(
          result.error === 'rate_limited'
            ? 'Too many attempts. Wait a minute and try again.'
            : 'We couldn’t resend the email. If it doesn’t arrive, try signing in — your account may already be confirmed.'
        );
      }
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending || onCooldown}
        className="text-sm font-medium text-foreground underline disabled:no-underline disabled:text-muted-foreground disabled:cursor-not-allowed"
      >
        {isPending ? 'Sending…' : onCooldown ? `Resend in ${secondsRemaining}s` : 'Resend email'}
      </button>
      {status === 'sent' && !errorText && (
        <p className="text-xs text-muted-foreground">Sent. Give it a minute to arrive.</p>
      )}
      {status === 'error' && errorText && (
        <p className="text-xs text-destructive">{errorText}</p>
      )}
    </div>
  );
}
