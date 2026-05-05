import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { MedicationWizard } from './medication-wizard';

interface PageProps {
  // Only one URL param honored: `?from=scan`. Set when the wizard was
  // entered from /me/medications/scan; on save the wizard returns there
  // instead of /me/medications. PR-2b will produce this URL from scan
  // cards. No URL state for in-progress form data.
  searchParams: Promise<{ from?: string }>;
}

export default async function NewMedicationPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: patient } = await supabase
    .from('patients')
    .select('id')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const params = await searchParams;
  const fromScan = params.from === 'scan';

  return (
    <PhoneShell hideNav>
      <MedicationWizard fromScan={fromScan} />
    </PhoneShell>
  );
}
