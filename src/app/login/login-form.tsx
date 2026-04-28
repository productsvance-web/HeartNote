'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
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
      if (result.ok) {
        setStatus('sent');
      } else {
        setStatus('error');
        setErrorMessage(result.error);
      }
    });
  }

  if (status === 'sent') {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm space-y-2">
        <p className="font-medium">Check your inbox.</p>
        <p className="text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. Open it on this device.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input
        type="email"
        required
        autoComplete="email"
        autoFocus
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-md border border-input bg-background text-base focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <Button type="submit" disabled={isPending || !email} className="w-full">
        {isPending ? 'Sending…' : 'Send sign-in link'}
      </Button>
      {status === 'error' && (
        <p className="text-sm text-destructive">{errorMessage}</p>
      )}
    </form>
  );
}
