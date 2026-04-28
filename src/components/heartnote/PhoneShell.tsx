import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

export function PhoneShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <div className="mx-auto max-w-md min-h-screen pb-28 relative">
        {children}
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}
