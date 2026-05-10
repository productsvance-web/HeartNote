// Daily-prompt hero — the home screen's invitation to talk. Sage mic +
// "Something feel off today?" headline + hint. Renders on every home
// state except cold-start (BaselineLogPrompt), processing (spinner), and
// tier 1/2/3 alerts (HeroAlertCard). Shape per
// docs/design/heartnote-home-mockup.html § hero.

import Link from 'next/link';
import { Mic } from 'lucide-react';

export function DailyPromptHero() {
  return (
    <div className="mx-4 mt-5 animate-fade-up">
    <Link
      href="/log"
      aria-label="Voice log"
      className="block rounded-3xl px-6 pt-7 pb-7 relative overflow-hidden active:scale-[0.99] transition"
      style={{
        background: 'var(--card)',
        border: '1.5px solid var(--sage-pale)',
        boxShadow:
          '0 2px 16px color-mix(in oklab, var(--sage) 14%, transparent)',
      }}
    >
      <span
        aria-hidden
        className="absolute pointer-events-none"
        style={{ top: -10, right: -8, opacity: 0.6 }}
      >
        <svg width="44" height="56" viewBox="0 0 32 40" fill="none">
          <path
            d="M16 38 V14"
            stroke="var(--sage)"
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.55"
          />
          <ellipse
            cx="11"
            cy="22"
            rx="4"
            ry="2"
            fill="var(--sage-pale)"
            transform="rotate(-25 11 22)"
          />
          <ellipse
            cx="21"
            cy="16"
            rx="4"
            ry="2"
            fill="var(--sage-pale)"
            transform="rotate(25 21 16)"
          />
          <ellipse
            cx="14"
            cy="11"
            rx="3"
            ry="1.6"
            fill="var(--sage-pale)"
            transform="rotate(-15 14 11)"
          />
        </svg>
      </span>

      <span
        aria-hidden
        className="flex h-[46px] w-[46px] items-center justify-center rounded-full"
        style={{
          background: 'var(--sage)',
          marginBottom: 18,
          boxShadow:
            '0 4px 14px color-mix(in oklab, var(--sage) 35%, transparent)',
        }}
      >
        <Mic size={20} className="text-white" strokeWidth={2} />
      </span>

      <h1
        className="font-display text-foreground"
        style={{
          fontSize: 26,
          fontWeight: 400,
          lineHeight: 1.22,
          letterSpacing: '-0.02em',
        }}
      >
        Something feel off today?
      </h1>
      <p
        className="text-muted-foreground"
        style={{ marginTop: 12, fontSize: 14, lineHeight: 1.4 }}
      >
        Tap to talk &mdash; I&rsquo;ll capture what&rsquo;s changed and pull together what to ask.
      </p>
    </Link>
    <div className="mt-3 text-center">
      <Link
        href="/log"
        className="text-[13px] font-semibold underline underline-offset-2"
        style={{ color: 'var(--sage-deep)' }}
      >
        Fill it in instead
      </Link>
    </div>
    </div>
  );
}
