// Public family-share route. No auth required — that's the whole point.
//
// Trust boundary: src/lib/family/snapshot.ts validates the token, the
// not-revoked / not-expired status, and applies redaction. This page
// never reads patient/caregiver columns directly; everything passes
// through loadSharedSnapshot.

import { Heart } from 'lucide-react';
import { loadSharedSnapshot } from '@/lib/family/snapshot';
import { SharedSnapshotView } from '@/components/heartnote/SharedSnapshotView';

export const dynamic = 'force-dynamic';

export default async function SharedSnapshotPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const result = await loadSharedSnapshot(token);

  if (result.kind === 'ok') {
    return <SharedSnapshotView snapshot={result.snapshot} />;
  }

  // 404 / revoked / expired all render the same minimal screen — we
  // deliberately don't differentiate "never existed" from "got revoked"
  // beyond the message itself, to avoid confirming whether a token was
  // ever real.
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
      style={{ background: 'linear-gradient(to bottom, var(--cream), var(--background))' }}
    >
      <Heart
        size={28}
        fill="currentColor"
        style={{ color: 'var(--muted-foreground)', opacity: 0.4 }}
      />
      <h1
        className="font-display text-[24px] text-foreground mt-4"
        style={{ letterSpacing: '-0.02em' }}
      >
        {result.kind === 'revoked' && 'This share link was revoked.'}
        {result.kind === 'expired' && 'This share link expired.'}
        {result.kind === 'not_found' && 'This link isn’t active.'}
      </h1>
      <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
        Ask the caregiver who sent it for a new one.
      </p>
    </div>
  );
}

export function generateMetadata() {
  return {
    title: 'A HeartNote check-in',
    robots: { index: false, follow: false },
  };
}
