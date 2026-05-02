'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { signInWithPassword } from './actions';
import { signInWithGoogle } from '@/lib/auth/oauth';
import { friendlyError } from '@/lib/auth/friendly-error';
import { PasswordInput } from '@/components/heartnote/PasswordInput';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Read straight from the form so iOS Password Autofill values get submitted
    // even if React onChange didn't fire (Safari keyboard-shortcut autofills).
    const formData = new FormData(e.currentTarget);
    const submittedEmail = ((formData.get('email') as string | null) ?? '').trim();
    setEmail(submittedEmail);
    setPassword((formData.get('password') as string | null) ?? '');
    setErrorKey(null);
    setErrorMessage('');

    startTransition(async () => {
      const result = await signInWithPassword(formData);
      // result is undefined on success (action redirects). Only reach here on failure.
      if (result && !result.ok) {
        setErrorKey(result.error);
        setErrorMessage(friendlyError(result.error));
      }
    });
  }

  return (
    <div className="space-y-4">
      <form action={signInWithGoogle.bind(null, '/login')}>
        <button
          type="submit"
          className="w-full rounded-full border border-border bg-card px-6 py-3.5 font-semibold text-base text-foreground shadow-soft active:scale-[0.98] transition flex items-center justify-center gap-3"
        >
          <GoogleIcon />
          Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
        <div className="flex-1 h-px bg-border" />
      </div>

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
        <label className="block space-y-1.5">
          <span className="text-sm font-medium flex items-center justify-between">
            <span>Password</span>
            <Link
              href="/auth/forgot-password"
              className="text-xs font-normal text-muted-foreground hover:text-foreground"
            >
              Forgot password?
            </Link>
          </span>
          <PasswordInput
            name="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
            placeholder="Your password"
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
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>
        {errorMessage && (
          <div className="text-sm text-destructive text-center space-y-1">
            <p>{errorMessage}</p>
            {errorKey === 'email_not_confirmed' && (
              <p>
                <Link
                  href={`/auth/check-email?email=${encodeURIComponent(email)}`}
                  className="underline"
                >
                  Resend confirmation email
                </Link>
              </p>
            )}
          </div>
        )}
      </form>

      <p className="text-sm text-muted-foreground text-center">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-medium text-foreground hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
