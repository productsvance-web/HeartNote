import { CalendarHeart } from 'lucide-react';
import { ComingSoonPage } from '@/components/heartnote/ComingSoonPage';
import { requireOnboarded } from '@/lib/auth/require-onboarded';

export default async function VisitsPage() {
  await requireOnboarded();
  return (
    <ComingSoonPage
      title="Visit prep"
      subtitle="Walk into the cardiologist's office ready."
      icon={CalendarHeart}
      description="Auto-generated 'since last visit' report — weight chart, symptom timeline, current meds, alerts that fired, plus the AHA's 11-question template. Built so the cardiologist can read it in 60 seconds during your 14-minute slot."
    />
  );
}
