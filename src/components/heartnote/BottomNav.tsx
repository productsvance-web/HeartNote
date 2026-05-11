// Bottom navigation — three identical ghost-circle utility buttons.
// Visual register matches src/components/heartnote/log/BottomBar.tsx
// (canonical-controls.md #6, extended sitewide per user direction
// 2026-05-10). The glass-bar wrapper and center FAB sphere were retired
// in that pass — the heavy green Log button was visually dominating
// every screen.
//
// Icon-only by direction. Active route → sage-deep filled, white glyph.
// Inactive → translucent cream, foreground glyph. Same fade-to-background
// gradient backdrop as the /log BottomBar.

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Mic, User } from 'lucide-react';

const ITEMS = [
  {
    href: '/dashboard',
    label: 'Home',
    Icon: Home,
    match: (p: string) =>
      p === '/' ||
      p === '/dashboard' ||
      p === '/trends' ||
      p.startsWith('/trends/'),
  },
  {
    href: '/log',
    label: 'Voice log',
    Icon: Mic,
    match: (p: string) => p === '/log' || p.startsWith('/log/'),
  },
  {
    href: '/me',
    label: 'Me',
    Icon: User,
    match: (p: string) => p === '/me' || p.startsWith('/me/'),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname() ?? '';

  return (
    <nav
      data-bottom-nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 pointer-events-none"
    >
      <div
        className="mx-auto max-w-md px-10 pt-3 flex items-center justify-between"
        style={{
          paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))',
          background:
            'linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--background) 86%, transparent) 38%, var(--background) 78%)',
        }}
      >
        {ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className="pointer-events-auto inline-flex items-center justify-center rounded-full active:scale-[0.94] transition"
              style={{
                width: 46,
                height: 46,
                background: active ? 'var(--sage-deep)' : 'var(--card)',
                border: active
                  ? '1px solid var(--sage-deep)'
                  : '0.5px solid var(--border)',
                color: active ? 'var(--card)' : 'var(--foreground)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                boxShadow: active
                  ? '0 4px 14px color-mix(in oklab, var(--sage-deep) 32%, transparent)'
                  : '0 1px 2px rgba(0,0,0,0.04)',
              }}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.8} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
