import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Returns the state needed by the client to render the review screen, in
// the flat ClaudeTiles shape the client expects.
//
// In the new schema, vitals live in daily_log_readings and symptoms in
// daily_log_symptom_events (both append-only across the day). Day-level
// fields (pillows, appetite, etc.) live on daily_logs but each dictation
// row sets them sparsely — "current value for the day" is the latest
// non-null across today's rows.
//
// This route synthesizes ClaudeTiles per (patient_id, log_date) — across
// all today's dictations, not just this one — so the tiles show the
// caregiver's running state for the day, not just the snapshot from the
// dictation that triggered the poll.
//
// RLS on each table enforces caregiver ownership; the auth check below is
// for clean error messaging.

type Reading = {
  field: 'weight_lb' | 'resting_hr' | 'spo2' | 'systolic_bp' | 'diastolic_bp';
  value: number;
  recorded_at: string;
};

type SymptomEvent = {
  symptom:
    | 'dyspnea'
    | 'cough'
    | 'chest_pain'
    | 'swelling'
    | 'fatigue'
    | 'pnd'
    | 'syncope'
    | 'cognition_change'
    | 'extremities_cold_clammy'
    | 'cyanosis'
    | 'early_satiety';
  present: boolean;
  severity: number | null;
  body_region: string | null;
  nocturnal: boolean | null;
  sputum_color: 'clear' | 'white' | 'pink_frothy' | null;
  chest_pain_character: string | null;
  recorded_at: string;
};

type DayLevelRow = {
  pillow_count: number | null;
  appetite_change: 'decreased' | 'unchanged' | 'increased' | null;
  urine_output_change: 'decreased' | 'unchanged' | 'increased' | null;
  activity_tolerance_change: string | null;
  created_at: string;
};

// Severity 0–4 → legacy ClaudeTiles enum the client renders. Keeps the
// existing "mild fog / confusion / severe" wording without forcing a
// client-side rewrite.
function severityToCognitionEnum(
  severity: number | null,
  present: boolean
): 'none' | 'mild_fog' | 'confusion' | 'severe' | null {
  if (!present) return 'none';
  if (severity === null) return null;
  if (severity <= 0) return 'none';
  if (severity === 1) return 'mild_fog';
  if (severity === 2 || severity === 3) return 'confusion';
  return 'severe';
}

function latestNonNull<T extends Record<string, unknown>, K extends keyof T>(
  rows: T[],
  field: K
): T[K] | null {
  for (const r of rows) if (r[field] !== null && r[field] !== undefined) return r[field];
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: log, error: logError } = await supabase
    .from('daily_logs')
    .select(
      'patient_id, log_date, processing_status, transcribed_text, processing_error, structured_observations'
    )
    .eq('id', id)
    .single();

  if (logError || !log) {
    return NextResponse.json({ error: logError?.message ?? 'not found' }, { status: 404 });
  }

  // Fetch in parallel: today's readings, today's symptom events, all today's
  // daily_logs rows for the day-level fields. Ordered most-recent first so
  // the synthesis below is "first non-null wins per field/symptom."
  const [readingsRes, eventsRes, dayRowsRes] = await Promise.all([
    supabase
      .from('daily_log_readings')
      .select('field, value, recorded_at')
      .eq('patient_id', log.patient_id)
      .eq('log_date', log.log_date)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('daily_log_symptom_events')
      .select(
        'symptom, present, severity, body_region, nocturnal, sputum_color, chest_pain_character, recorded_at'
      )
      .eq('patient_id', log.patient_id)
      .eq('log_date', log.log_date)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('daily_logs')
      .select(
        'pillow_count, appetite_change, urine_output_change, activity_tolerance_change, created_at'
      )
      .eq('patient_id', log.patient_id)
      .eq('log_date', log.log_date)
      .order('created_at', { ascending: false }),
  ]);

  const readings = (readingsRes.data ?? []) as Reading[];
  const events = (eventsRes.data ?? []) as SymptomEvent[];
  const dayRows = (dayRowsRes.data ?? []) as DayLevelRow[];

  // Latest reading per field
  const latestReading = new Map<Reading['field'], number>();
  for (const r of readings) {
    if (!latestReading.has(r.field)) latestReading.set(r.field, Number(r.value));
  }

  // Latest event per symptom
  const latestEvent = new Map<SymptomEvent['symptom'], SymptomEvent>();
  for (const e of events) {
    if (!latestEvent.has(e.symptom)) latestEvent.set(e.symptom, e);
  }

  const cough = latestEvent.get('cough') ?? null;
  const chestPain = latestEvent.get('chest_pain') ?? null;
  const dyspnea = latestEvent.get('dyspnea') ?? null;
  const swelling = latestEvent.get('swelling') ?? null;
  const fatigue = latestEvent.get('fatigue') ?? null;
  const cognition = latestEvent.get('cognition_change') ?? null;
  const pnd = latestEvent.get('pnd') ?? null;
  const syncope = latestEvent.get('syncope') ?? null;
  const cyanosis = latestEvent.get('cyanosis') ?? null;
  const earlySatiety = latestEvent.get('early_satiety') ?? null;
  const extremitiesColdClammy = latestEvent.get('extremities_cold_clammy') ?? null;

  const tiles = {
    // Primary tiles
    weight_lb: latestReading.get('weight_lb') ?? null,
    systolic_bp: latestReading.get('systolic_bp') ?? null,
    diastolic_bp: latestReading.get('diastolic_bp') ?? null,
    resting_hr: latestReading.get('resting_hr') ?? null,
    spo2: latestReading.get('spo2') ?? null,
    dyspnea_level: dyspnea?.present ? (dyspnea.severity ?? null) : dyspnea ? 0 : null,
    pillow_count: latestNonNull(dayRows, 'pillow_count'),
    pnd_episode: pnd?.present ?? null,
    cough_present: cough?.present ?? null,
    cough_nocturnal: cough?.nocturnal ?? null,
    sputum_color: cough?.sputum_color ?? null,
    swelling_severity: swelling?.present ? (swelling.severity ?? null) : swelling ? 0 : null,
    cyanosis: cyanosis?.present ?? null,
    chest_pain: chestPain?.present ?? null,
    syncope: syncope?.present ?? null,
    appetite_change: latestNonNull(dayRows, 'appetite_change'),
    early_satiety: earlySatiety?.present ?? null,
    fatigue_level: fatigue?.present ? (fatigue.severity ?? null) : fatigue ? 0 : null,
    cognition_change: cognition
      ? severityToCognitionEnum(cognition.severity, cognition.present)
      : null,
    // Background "more notes" fields
    extremities_cold_clammy: extremitiesColdClammy?.present ?? null,
    urine_output_change: latestNonNull(dayRows, 'urine_output_change'),
    chest_pain_character: chestPain?.chest_pain_character ?? null,
    activity_tolerance_change: latestNonNull(dayRows, 'activity_tolerance_change'),
  };

  return NextResponse.json(
    {
      processing_status: log.processing_status,
      transcribed_text: log.transcribed_text,
      processing_error: log.processing_error,
      structured_observations: log.structured_observations,
      ...tiles,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}
