import { Users } from 'lucide-react';
import { ComingSoonPage } from '@/components/heartnote/ComingSoonPage';
import { requireOnboarded } from '@/lib/auth/require-onboarded';

export default async function FamilyPage() {
  await requireOnboarded();
  return (
    <ComingSoonPage
      title="Family"
      subtitle="Read-only status for siblings, no app install required."
      icon={Users}
      description="A shareable link your sister or brother can bookmark — green/yellow/red status, last log, next cardiology visit. No onboarding, no account. Cuts the 14-text-message-a-week update treadmill in half."
    />
  );
}
