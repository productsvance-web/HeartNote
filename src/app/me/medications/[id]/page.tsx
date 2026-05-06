import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { EditMedicationFlow, type EditInitial } from '../_flow/EditMedicationFlow';
import type { CadenceDraft } from '../cadence/cadence-fields';
import type { CadenceKind } from '@/lib/medications/cadence';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMedicationPage({ params }: PageProps) {
  const { id } = await params;
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

  const { data: med } = await supabase
    .from('medications')
    .select(
      'id, drug_name, dose, started_at, ended_at, notes, stopped_at, cadence_kind, cycle_on_days, cycle_off_days, interval_days, form, rxcui, ingredient'
    )
    .eq('id', id)
    .eq('patient_id', patient.id)
    .single();

  if (!med) notFound();

  const { data: doseTimes } = await supabase
    .from('medication_dose_times')
    .select('time_of_day, quantity, ordinal, applies_to_dow')
    .eq('medication_id', id)
    .order('ordinal', { ascending: true });

  const dts = (doseTimes ?? []).map((d) => ({
    timeOfDay: d.time_of_day,
    quantity: Number(d.quantity),
    appliesToDow: d.applies_to_dow,
  }));

  // Reconstruct CadenceDraft from stored columns. Mirrors the
  // buildInitialDraft heuristic in the prior medications-form: cycleUnit
  // promotes to weeks when cycleOnDays is a multiple of 7 and >= 7.
  const kind = (med.cadence_kind ?? 'as_needed') as CadenceKind;
  const groups =
    kind === 'specific_days'
      ? Array.from(new Set(dts.map((dt) => dt.appliesToDow ?? 0)))
      : [];
  const cycleUnit: 'day' | 'week' =
    kind === 'cyclical' &&
    med.cycle_on_days != null &&
    med.cycle_on_days >= 7 &&
    med.cycle_on_days % 7 === 0 &&
    (med.cycle_off_days ?? 0) % 7 === 0
      ? 'week'
      : 'day';

  const draft: CadenceDraft = {
    kind,
    cycleOnDays: med.cycle_on_days,
    cycleOffDays: med.cycle_off_days,
    cycleUnit,
    intervalDays: med.interval_days,
    startedAt: med.started_at ?? '',
    endedAt: med.ended_at ?? '',
    doseTimes: dts,
    groups,
  };

  const initial: EditInitial = {
    id: med.id,
    drugName: med.drug_name,
    rxcui: med.rxcui,
    ingredient: med.ingredient,
    form: med.form,
    dose: med.dose ?? '',
    notes: med.notes ?? '',
    isStopped: med.stopped_at !== null,
    draft,
  };

  return (
    <PhoneShell hideNav>
      <EditMedicationFlow initial={initial} />
    </PhoneShell>
  );
}
