'use client';

import { useState, useTransition } from 'react';
import { updatePassword } from './actions';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/constants';
import { friendlyError } from '@/lib/auth/friendly-error';
import { PasswordInput } from '@/components/heartnote/PasswordInput';

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
        <PasswordInput
          name="password"
          value={password}
          onChange={setPassword}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          autoFocus
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Confirm new password</span>
        <PasswordInput
          name="confirm"
          value={confirm}
          onChange={setConfirm}
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          placeholder="Type it again"
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
    case 'weak_password':
      return friendlyError(key);
    default:
      return key;
  }
}
