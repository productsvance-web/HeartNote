'use client';

import { useState, useTransition } from 'react';
import { Mail } from 'lucide-react';
import { requestPasswordReset } from './actions';

export function ForgotPasswordForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const submittedEmail = ((formData.get('email') as string | null) ?? email).trim();
    if (!submittedEmail) {
      setStatus('error');
      setErrorText('Enter your email.');
      return;
    }
    setEmail(submittedEmail);
    setErrorText('');
    startTransition(async () => {
      const result = await requestPasswordReset(submittedEmail);
      if (result.ok) setStatus('sent');
      else {
        setStatus('error');
        setErrorText(
          result.error === 'invalid_email'
            ? 'Enter a valid email address.'
            : 'Something went wrong. Try again.'
        );
      }
    });
  }

  if (status === 'sent') {
    return (
      <div className="text-sm space-y-3">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
          aria-hidden
        >
          <Mail size={20} />
        </div>
        <p className="font-display text-xl text-center">Check your inbox</p>
        <p className="text-muted-foreground text-center leading-relaxed">
          If you have a HeartNote account, a reset link is on its way to{' '}
          <span className="font-medium text-foreground">{email}</span>. Open it within an hour.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
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
        {isPending ? 'Sending…' : 'Send reset link'}
      </button>
      {status === 'error' && errorText && (
        <p className="text-sm text-destructive text-center">{errorText}</p>
      )}
    </form>
  );
}
