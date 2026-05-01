import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { MedicationForm } from '../medications-form';

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
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link href="/me/medications" className="text-sm text-muted-foreground">
          ← Medications
        </Link>
        <h1 className="font-display text-3xl text-foreground mt-2">Add medication</h1>
        <p className="text-sm text-muted-foreground mt-1">
          We&rsquo;ll figure out the drug class from the name.
        </p>
      </header>

      <section className="mt-6 mx-4 rounded-3xl bg-card shadow-card p-6">
        <MedicationForm mode="new" />
      </section>
    </PhoneShell>
  );
}
