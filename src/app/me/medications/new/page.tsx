import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { NewMedicationFlow } from '../_flow/NewMedicationFlow';

export default async function NewMedicationPage() {
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

  return (
    <PhoneShell hideNav>
      <NewMedicationFlow />
    </PhoneShell>
  );
}
