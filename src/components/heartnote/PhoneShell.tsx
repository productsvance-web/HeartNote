import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { AlertGlow } from './AlertGlow';
import { getCurrentTier } from '@/lib/alerts/current-tier';

export async function PhoneShell({
  children,
  hideNav = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
}) {
  // Tier-1 read is `cache()`-wrapped, so any other component in the
  // same request that needs it shares one round-trip.
  const tier = await getCurrentTier();

  return (
    <div className="min-h-screen bg-gradient-to-b from-cream to-background">
      <div className="mx-auto max-w-md min-h-screen pb-28 relative">
        {children}
      </div>
      {!hideNav && <BottomNav />}
      {tier === 'tier_1_911' && <AlertGlow />}
    </div>
  );
}
