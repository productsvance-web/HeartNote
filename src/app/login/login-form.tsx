'use client';

import { useState, useTransition } from 'react';
import { Mail } from 'lucide-react';
import { sendMagicLink } from './actions';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await sendMagicLink(email);
      if (result.ok) setStatus('sent');
      else {
        setStatus('error');
        setErrorMessage(result.error);
      }
    });
  }

  if (status === 'sent') {
    return (
      <div className="text-sm space-y-3">
        <div
          className="h-12 w-12 rounded-full flex items-center justify-center mx-auto"
          style={{ background: 'var(--status-good-soft)', color: 'var(--status-good-foreground)' }}
        >
          <Mail size={20} />
        </div>
        <p className="font-display text-xl text-center">Check your inbox</p>
        <p className="text-muted-foreground text-center">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
          Open it on this device.
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
        disabled={isPending || !email}
        className="w-full rounded-full px-6 py-4 font-semibold text-base text-primary-foreground shadow-soft active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background:
            'linear-gradient(135deg, var(--sage), color-mix(in oklab, var(--sage) 70%, white))',
        }}
      >
        {isPending ? 'Sending…' : 'Send sign-in link'}
      </button>
      {status === 'error' && (
        <p className="text-sm text-destructive text-center">{errorMessage}</p>
      )}
    </form>
  );
}
