'use client';

import { forwardRef } from 'react';

type Props = {
  name: string;
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
};

// 6-digit numeric one-time code. Single input by design — iOS/Android render the
// "From Messages" autofill chip on a single field with autocomplete=one-time-code,
// and Stripe/Vercel/GitHub all ship the same single-input + letter-spacing pattern.
// Filters non-digits on input (paste-friendly) and calls onComplete when 6 digits
// are present so the form can submit without a manual tap.
export const OtpInput = forwardRef<HTMLInputElement, Props>(function OtpInput(
  { name, value, onChange, onComplete, disabled, autoFocus, ariaLabel = 'One-time code' },
  ref,
) {
  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    onChange(digits);
    if (digits.length === 6) onComplete?.(digits);
  }

  return (
    <input
      ref={ref}
      type="text"
      name={name}
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="\d{6}"
      maxLength={6}
      minLength={6}
      required
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder="123456"
      className="input text-center font-mono tracking-[0.5em] text-2xl py-4"
    />
  );
});
