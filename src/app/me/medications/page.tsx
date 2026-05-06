import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { MedicationsListClient, type MedSummary } from './medications-list-client';

interface PageProps {
  searchParams: Promise<{ added?: string }>;
}

export default async function MedicationsPage({ searchParams }: PageProps) {
  const { added } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!patient) redirect('/onboarding');

  // Postgres orders enums by declaration order; med_class declares
  // loop_diuretic first so this naturally surfaces the highest-signal CHF
  // class at the top. Reordering the enum reorders this list — change both
  // together (see src/lib/medications/classes.ts).
  const { data: meds } = await supabase
    .from('medications')
    .select(
      'id, drug_name, drug_class, dose, stopped_at, cadence_kind, cycle_on_days, cycle_off_days, interval_days, dose_times:medication_dose_times(time_of_day, applies_to_dow, ordinal)'
    )
    .eq('patient_id', patient.id)
    .order('drug_class', { ascending: true })
    .order('drug_name', { ascending: true });

  const rows = (meds ?? []).map((m) => ({
    ...m,
    dose_times: (m.dose_times ?? []).slice().sort((a, b) => a.ordinal - b.ordinal),
  })) as MedSummary[];
  const active = rows.filter((m) => m.stopped_at === null);
  const stopped = rows.filter((m) => m.stopped_at !== null);

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <Link href="/me" className="text-sm text-muted-foreground">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl text-foreground mt-2">Medications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {patient.display_name}&rsquo;s active list. Voice-log mentions update this automatically.
        </p>
      </header>

      <MedicationsListClient
        active={active}
        stopped={stopped}
        patientName={patient.display_name}
        addedId={added ?? null}
      />
    </PhoneShell>
  );
}
