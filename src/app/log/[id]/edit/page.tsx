// Manual-edit view for a single daily_logs row. Loads the day-level
// fields, every reading and symptom event tied to this log, and hands
// them to the client edit form. Submits via a server action that
// updates the rows and re-runs the alert engine for the log_date.
//
// Plain-English: the AI sometimes hears "she felt off" as a swelling
// event, or extracts "weight 178" from background noise. This view
// lets the caregiver fix those mistakes — every numeric reading and
// every symptom event is editable or removable.

import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { LogEditForm } from './edit-form';

export default async function LogEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: logId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch the log + verify the caregiver owns it (RLS does this too,
  // but the explicit join lets us return early with notFound() instead
  // of relying on null-data fallthrough.)
  const { data: log } = await supabase
    .from('daily_logs')
    .select(
      'id, patient_id, log_date, notes, pillow_count, appetite_change, urine_output_change, activity_step_change, transcribed_text',
    )
    .eq('id', logId)
    .maybeSingle();
  if (!log) notFound();

  const { data: patient } = await supabase
    .from('patients')
    .select('display_name, caregiver_id')
    .eq('id', log.patient_id)
    .single();
  if (!patient || patient.caregiver_id !== user.id) notFound();

  const [readingsRes, eventsRes] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('id, field, value, recorded_at')
      .eq('source_log_id', logId)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('daily_log_symptom_events')
      .select(
        'id, symptom, present, severity, body_region, nocturnal, sputum_color, chest_pain_character, resolves_overnight, postural, recorded_at',
      )
      .eq('source_log_id', logId)
      .order('recorded_at', { ascending: true }),
  ]);

  return (
    <PhoneShell hideNav>
      <header className="px-6 pt-6 pb-2">
        <Link
          href="/log"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground active:text-foreground transition-colors"
        >
          <ChevronLeft size={16} />
          Voice log
        </Link>
        <p
          className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
          style={{ letterSpacing: '0.08em' }}
        >
          Edit · {log.log_date}
        </p>
        <h1
          className="font-display text-[28px] text-foreground mt-1.5 leading-tight"
          style={{ letterSpacing: '-0.02em', fontWeight: 500 }}
        >
          Fix what was misheard.
        </h1>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          Edit or remove anything that doesn&rsquo;t match what {patient.display_name} actually
          reported. To add a new reading, dictate another log.
        </p>
      </header>

      <LogEditForm
        logId={log.id}
        logDate={log.log_date}
        initialNotes={log.notes ?? ''}
        initialPillowCount={log.pillow_count}
        initialAppetiteChange={log.appetite_change as 'decreased' | 'unchanged' | 'increased' | null}
        initialUrineOutputChange={
          log.urine_output_change as 'decreased' | 'unchanged' | 'increased' | null
        }
        initialActivityStepChange={
          log.activity_step_change as 'none' | 'mild_slowdown' | 'severe_change' | null
        }
        initialTranscript={log.transcribed_text ?? ''}
        initialReadings={(readingsRes.data ?? []).map((r) => ({
          id: r.id,
          field: r.field,
          value: r.value,
          recordedAt: r.recorded_at,
        }))}
        initialSymptomEvents={(eventsRes.data ?? []).map((e) => ({
          id: e.id,
          symptom: e.symptom,
          present: e.present,
          severity: e.severity,
          bodyRegion: e.body_region,
          nocturnal: e.nocturnal,
          sputumColor: e.sputum_color,
          chestPainCharacter: e.chest_pain_character,
          resolvesOvernight: e.resolves_overnight,
          postural: e.postural,
        }))}
      />
    </PhoneShell>
  );
}
