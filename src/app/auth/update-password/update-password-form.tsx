'use client';

import { useState, useTransition } from 'react';
import { updatePassword } from './actions';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';

export function UpdatePasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setPassword((formData.get('password') as string | null) ?? '');
    setConfirm((formData.get('confirm') as string | null) ?? '');
    setErrorText('');
    startTransition(async () => {
      const result = await updatePassword(formData);
      if (result && !result.ok) {
        setErrorText(messageFor(result.error));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">New password</span>
        <input
          type="password"
          name="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          autoFocus
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Confirm new password</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          placeholder="Type it again"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
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
        {isPending ? 'Updating…' : 'Update password'}
      </button>
      {errorText && (
        <p className="text-sm text-destructive text-center">{errorText}</p>
      )}
    </form>
  );
}

function messageFor(key: string): string {
  switch (key) {
    case 'update_failed':
      return 'We couldn’t update your password. Try again.';
    default:
      return key;
  }
}
