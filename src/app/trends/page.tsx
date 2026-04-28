import { TrendingUp } from 'lucide-react';
import { ComingSoonPage } from '@/components/heartnote/ComingSoonPage';
import { requireOnboarded } from '@/lib/auth/require-onboarded';

export default async function TrendsPage() {
  await requireOnboarded();
  return (
    <ComingSoonPage
      title="Trends"
      subtitle="Patterns across days, not snapshots."
      icon={TrendingUp}
      description="Weight charts, symptom timelines, and AI-detected patterns across the last 7, 30, and 90 days. Unlocks once we wire alert tier-detection — that's next on the build."
    />
  );
}
