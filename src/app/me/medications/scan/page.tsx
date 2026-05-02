import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { ScanClient } from './scan-client';

export default async function MedicationScanPage() {
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
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link href="/me/medications" className="text-sm text-muted-foreground">
          ← Medications
        </Link>
        <h1 className="font-display text-3xl text-foreground mt-2">Scan a label</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Take a photo of a pill bottle, prescription label, or screenshot of a med list.
          We&rsquo;ll pull out the medications.
        </p>
      </header>

      <ScanClient />
    </PhoneShell>
  );
}
