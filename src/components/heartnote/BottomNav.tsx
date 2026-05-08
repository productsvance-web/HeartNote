// Bottom navigation — 3-tab + center FAB, per design-system
// designs/home-screen.jsx. Home / Log (FAB) / Me. The mic FAB is the
// permanent surface for the voice log — primary action of the app, lifted
// out of any one screen so the caregiver can dictate from anywhere.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Mic, User } from 'lucide-react';

export function BottomNav() {
  const pathname = usePathname();
  const isHome = pathname === '/dashboard' || pathname === '/' || pathname === '/trends';
  const isMe = pathname === '/me' || pathname?.startsWith('/me/') === true;

  return (
    <nav data-bottom-nav className="fixed bottom-0 inset-x-0 z-40 pointer-events-none">
      <div className="relative mx-auto max-w-md h-[92px] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {/* Glass bar */}
        <div
          className="pointer-events-auto absolute left-3 right-3 bottom-1.5 h-[70px] rounded-[32px] flex items-center"
          style={{
            background: 'color-mix(in oklab, var(--card) 78%, transparent)',
            backdropFilter: 'blur(20px) saturate(170%)',
            WebkitBackdropFilter: 'blur(20px) saturate(170%)',
            border: '0.5px solid color-mix(in oklab, var(--foreground) 8%, transparent)',
            boxShadow:
              '0 12px 32px -10px color-mix(in oklab, var(--foreground) 18%, transparent), 0 2px 6px -2px color-mix(in oklab, var(--foreground) 8%, transparent)',
          }}
        >
          <NavTab href="/dashboard" label="Home" active={isHome}>
            <Home size={22} strokeWidth={isHome ? 2.2 : 1.7} />
          </NavTab>
          <span className="w-[80px] shrink-0" />
          <NavTab href="/me" label="Me" active={isMe}>
            <User size={22} strokeWidth={isMe ? 2.2 : 1.7} />
          </NavTab>
        </div>

        {/* Center FAB — voice log */}
        <Link
          href="/log"
          aria-label="Voice log"
          className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[36px] flex flex-col items-center"
        >
          <span
            className="relative w-[62px] h-[62px] rounded-full flex items-center justify-center text-white"
            style={{
              background:
                'radial-gradient(circle at 30% 22%, oklch(0.74 0.07 155) 0%, oklch(0.55 0.07 155) 70%, oklch(0.48 0.06 155) 100%)',
              boxShadow:
                '0 14px 32px -8px color-mix(in oklab, var(--sage) 60%, transparent), 0 6px 14px -4px color-mix(in oklab, var(--foreground) 18%, transparent), inset 0 1.5px 0 rgba(255,255,255,0.40), inset 0 -1px 0 rgba(0,0,0,0.10)',
            }}
          >
            <span
              aria-hidden
              className="absolute -inset-1.5 rounded-full animate-pulse-ring"
              style={{
                border: '2px solid color-mix(in oklab, var(--sage) 35%, transparent)',
                opacity: 0.6,
              }}
            />
            <Mic size={26} strokeWidth={2} />
          </span>
          <span
            className="text-[10.5px] font-semibold uppercase mt-1.5"
            style={{
              letterSpacing: '0.08em',
              color: 'var(--accent-foreground)',
            }}
          >
            Log
          </span>
        </Link>
      </div>
    </nav>
  );
}

function NavTab({
  href,
  label,
  active,
  children,
}: {
  href: string;
  label: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="relative flex-1 flex flex-col items-center gap-0.5 py-2"
      style={{ color: active ? 'var(--foreground)' : 'var(--muted-foreground)' }}
    >
      <span style={{ opacity: active ? 1 : 0.7 }}>{children}</span>
      <span
        className="text-[10.5px]"
        style={{
          letterSpacing: '0.01em',
          fontWeight: active ? 600 : 500,
        }}
      >
        {label}
      </span>
      {active && (
        <span
          aria-hidden
          className="absolute bottom-1.5 w-1 h-1 rounded-full"
          style={{ background: 'var(--sage)' }}
        />
      )}
    </Link>
  );
}
