'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LineChart, Users, CalendarHeart, User } from 'lucide-react';

const tabs = [
  { to: '/dashboard', label: 'Home', Icon: Home },
  { to: '/trends/spo2', label: 'Trends', Icon: LineChart },
  { to: '/family', label: 'Family', Icon: Users },
  { to: '/visits', label: 'Visits', Icon: CalendarHeart },
  { to: '/me', label: 'Me', Icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/85 backdrop-blur-lg">
      <div className="mx-auto max-w-md grid grid-cols-5 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ to, label, Icon }) => {
          const isActive = pathname === to || (to === '/dashboard' && pathname === '/');
          return (
            <Link
              key={to}
              href={to}
              className={`flex flex-col items-center gap-1 py-1.5 rounded-xl transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div
                className={`p-1.5 rounded-full transition-all ${isActive ? 'bg-accent' : ''}`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              </div>
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
