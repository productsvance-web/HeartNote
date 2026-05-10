// Server-only: assembles the full data context for /log page render.
// Mirrors getYesterdayLog's pattern (one round-trip per concern, then
// reduce). Returns a flat shape the client can hydrate from.
//
// Loaded by src/app/log/page.tsx; consumed by src/app/log/log-page-client.tsx.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/types.ts';

export type SymptomState = {
  // Today's most-recent value per symptom (from daily_log_symptom_events
  // ordered by recorded_at desc). Hydrates the modal so a re-open shows
  // what voice or prior tap captured.
  dyspneaSeverity: number | null;
  cough: 'none' | 'daytime' | 'nocturnal' | null;
  sputumColor: 'clear' | 'white' | 'white_frothy' | 'pink_frothy' | null;
  swellingSeverity: number | null;
  swellingRegion: 'ankles' | 'calves' | 'thighs' | 'abdomen' | null;
  swellingResolvesOvernight: boolean | null;
  fatigueSeverity: number | null; // null = not present today
  // 'severe' (severity 4) round-trips voice extraction; modal renders only
  // the first 3 options because severity-4 fires the alert banner directly.
  cognitionChange: 'clear' | 'mild_fog' | 'confusion' | 'severe' | null;
  appetiteChange: 'decreased' | 'unchanged' | 'increased' | null;
  urineOutputChange: 'decreased' | 'unchanged' | 'increased' | null;
  chestPain: boolean | null;
  syncope: boolean | null;
  cyanosis: boolean | null;
  pnd: boolean | null;
  earlySatiety: boolean | null;
  extremitiesColdClammy: boolean | null;
  pulseIrregular: boolean | null;
  dizziness: boolean | null;
  dizzinessPostural: boolean | null;
  nausea: boolean | null;
};

export type AssessmentTrigger = {
  rule_id: string;
  label: string;
  evidence: Record<string, unknown>;
};

// Source of each symptom's most-recent event today. Drives the ear-button
// glow (only voice-sourced symptoms light the ear; tap-only symptoms do
// not). Field is null when nothing has been logged for that symptom.
export type SymptomSource = 'voice' | 'tap' | null;
export type SymptomSourcesState = Record<keyof SymptomState, SymptomSource>;

export type LogPageContext = {
  patient: {
    id: string;
    displayName: string;
    normalPillowCount: number;
    dryWeightLb: number | null;
    baselineSbpBand: [number, number] | null;
    baselineDbpBand: [number, number] | null;
    baselineHrBand: [number, number] | null;
  };
  vitals: {
    weight: { yesterdayLb: number | null; baseline14dLb: number | null; todayLb: number | null };
    pillows: { yesterdayCount: number | null; baseline7dCount: number | null; todayCount: number | null };
    bp: { yesterday: { sys: number; dia: number } | null; today: { sys: number; dia: number } | null };
    hr: { yesterdayBpm: number | null; todayBpm: number | null };
    spo2: { yesterdayPct: number | null; todayPct: number | null };
  };
  symptoms: SymptomState;
  symptomSources: SymptomSourcesState;
  assessment: {
    tier: 'tier_1_911' | 'tier_2_today' | 'tier_3_48hr' | 'tier_4_log';
    triggers: AssessmentTrigger[];
    coldStart: boolean;
  } | null;
  todayLogId: string | null; // most recent daily_logs row for today (if any)
  todayLogStatus: 'pending' | 'analyzing' | 'complete' | 'failed' | null;
  todayLogIsVoice: boolean; // true if most-recent today row has tap_session_id IS NULL
  transcript: string | null;
  caregiverSummary: string | null;
  dayN: number;
};

export async function loadLogPageContext(
  supabase: SupabaseClient<Database>,
  userId: string,
  today: string,
): Promise<LogPageContext | null> {
  const { data: patient } = await supabase
    .from('patients')
    .select('id,display_name,normal_pillow_count,dry_weight_lb,baseline_sbp_low,baseline_sbp_high,baseline_dbp_low,baseline_dbp_high,baseline_resting_hr_low,baseline_resting_hr_high')
    .eq('caregiver_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!patient) return null;

  const yesterday = isoDateOffset(today, -1);
  const fourteenDaysAgo = isoDateOffset(today, -14);
  const sevenDaysAgo = isoDateOffset(today, -7);

  // Parallel queries for all the data the page needs.
  const [
    todaysLogsRes,
    todayReadingsRes,
    todaySymptomsRes,
    yesterdayReadingsRes,
    baselineWeightRes,
    baselinePillowsRes,
    todayAssessmentRes,
    allLogDatesRes,
  ] = await Promise.all([
    // Today's daily_logs rows. tap_session_id is added by the Task 8 migration
    // (20260510010000_log_tap_session.sql) and is not yet in the generated
    // Supabase types — select('*') and read it defensively below.
    supabase
      .from('daily_logs')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('created_at', { ascending: false }),
    supabase
      .from('daily_log_readings')
      .select('field, value, recorded_at')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('daily_log_symptom_events')
      .select('symptom,present,severity,body_region,nocturnal,sputum_color,resolves_overnight,postural,recorded_at,source_log_id')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .order('recorded_at', { ascending: false }),
    supabase
      .from('daily_log_readings')
      .select('field, value')
      .eq('patient_id', patient.id)
      .eq('log_date', yesterday)
      .order('recorded_at', { ascending: false }),
    // 14-day baseline weight = oldest weight reading in the window (so trend
    // = today - oldest captures the longest-window delta).
    supabase
      .from('daily_log_readings')
      .select('value, recorded_at')
      .eq('patient_id', patient.id)
      .eq('field', 'weight_lb')
      .gte('log_date', fourteenDaysAgo)
      .lt('log_date', today)
      .order('recorded_at', { ascending: true })
      .limit(1),
    // 7-day baseline pillows from daily_logs (per-row). Per the plan's
    // R8 fallback (large blast radius across dashboard/trends/visits),
    // pillow_count stays on daily_logs in this PR; the engine reads
    // most-recent-non-null across the day's rows.
    supabase
      .from('daily_logs')
      .select('pillow_count')
      .eq('patient_id', patient.id)
      .gte('log_date', sevenDaysAgo)
      .lt('log_date', today)
      .not('pillow_count', 'is', null),
    supabase
      .from('daily_assessments')
      .select('tier, triggers, cold_start')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .maybeSingle(),
    supabase.from('daily_logs').select('log_date').eq('patient_id', patient.id),
  ]);

  const todaysLogs = todaysLogsRes.data ?? [];
  const todayReadings = todayReadingsRes.data ?? [];
  const todaySymptoms = todaySymptomsRes.data ?? [];
  const yesterdayReadings = yesterdayReadingsRes.data ?? [];
  const baselineWeightRow = baselineWeightRes.data?.[0] ?? null;
  const baselinePillows = (baselinePillowsRes.data ?? [])
    .map((r) => r.pillow_count as number | null)
    .filter((v): v is number => v !== null);
  const assessment = todayAssessmentRes.data ?? null;

  // Most-recent today's row drives transcript/summary/status display.
  const mostRecentToday = todaysLogs[0] ?? null;
  // Pillow count for today: most-recent non-null across all today's rows.
  const todayPillowCount =
    todaysLogs.find((r) => r.pillow_count !== null && r.pillow_count !== undefined)
      ?.pillow_count ?? null;
  // Day-level appetite/urine: most-recent non-null across rows.
  const todayAppetite =
    todaysLogs.find((r) => r.appetite_change !== null)?.appetite_change ?? null;
  const todayUrine =
    todaysLogs.find((r) => r.urine_output_change !== null)?.urine_output_change ?? null;

  // Reduce readings → most-recent value per field for today + yesterday.
  const mostRecentReading = (
    rows: Array<{ field: string; value: number; recorded_at?: string }>,
    field: string,
  ): number | null => {
    const r = rows.find((x) => x.field === field);
    return r ? Number(r.value) : null;
  };

  // Reduce symptoms → most-recent event per symptom.
  const mostRecentSymptom = (s: string) =>
    todaySymptoms.find((e) => e.symptom === s) ?? null;

  const dyspnea = mostRecentSymptom('dyspnea');
  const cough = mostRecentSymptom('cough');
  const swelling = mostRecentSymptom('swelling');
  const fatigue = mostRecentSymptom('fatigue');
  const cognition = mostRecentSymptom('cognition_change');
  const chestPain = mostRecentSymptom('chest_pain');
  const syncope = mostRecentSymptom('syncope');
  const cyanosis = mostRecentSymptom('cyanosis');
  const pnd = mostRecentSymptom('pnd');
  const earlySatiety = mostRecentSymptom('early_satiety');
  const coldClammy = mostRecentSymptom('extremities_cold_clammy');
  const pulseIrregular = mostRecentSymptom('pulse_irregular');
  const dizziness = mostRecentSymptom('dizziness');
  const nausea = mostRecentSymptom('nausea');

  // Voice-row ids today — any daily_logs row with tap_session_id IS NULL
  // is a voice (or process) row. Symptom events whose source_log_id
  // matches one of these are 'voice'-sourced and light the ear glow.
  const voiceRowIds = new Set(
    todaysLogs
      .filter(
        (r) =>
          (r as { tap_session_id?: string | null }).tap_session_id === null ||
          (r as { tap_session_id?: string | null }).tap_session_id === undefined,
      )
      .map((r) => r.id as string),
  );
  const sourceFor = (
    ev: { source_log_id?: string | null } | null | undefined,
  ): SymptomSource => {
    if (!ev) return null;
    const sid = ev.source_log_id ?? null;
    if (sid !== null && voiceRowIds.has(sid)) return 'voice';
    return 'tap';
  };

  // Cough → caregiver enum. We reduce to one of: none / daytime / nocturnal.
  const coughEnum: SymptomState['cough'] = (() => {
    if (!cough) return null;
    if (cough.present === false) return 'none';
    return cough.nocturnal === true ? 'nocturnal' : 'daytime';
  })();

  // Cognition severity → enum. Severity 4 returns 'severe' so it round-trips.
  const cognitionEnum: SymptomState['cognitionChange'] = (() => {
    if (!cognition || cognition.present === false) return null;
    const s = cognition.severity;
    if (s === 4) return 'severe';
    if (s === 2) return 'confusion';
    if (s === 1) return 'mild_fog';
    if (s === 0) return 'clear';
    return null;
  })();

  const distinctLogDates = new Set(
    (allLogDatesRes.data ?? []).map((r) => r.log_date as string),
  );
  const dayN = distinctLogDates.has(today)
    ? distinctLogDates.size
    : distinctLogDates.size + 1;

  // tap_session_id may not be on the type yet (Task 8 migration). Read
  // defensively: undefined or null → voice row.
  const mostRecentTapSessionId =
    mostRecentToday !== null
      ? (mostRecentToday as { tap_session_id?: string | null }).tap_session_id ?? null
      : null;
  const todayLogIsVoice = mostRecentToday !== null && mostRecentTapSessionId === null;

  const obs = (mostRecentToday?.structured_observations as
    | { caregiver_summary?: string }
    | null) ?? null;

  return {
    patient: {
      id: patient.id as string,
      displayName: patient.display_name as string,
      normalPillowCount: (patient.normal_pillow_count as number | null) ?? 1,
      dryWeightLb:
        patient.dry_weight_lb !== null && patient.dry_weight_lb !== undefined
          ? Number(patient.dry_weight_lb)
          : null,
      baselineSbpBand: bandOrNull(patient.baseline_sbp_low, patient.baseline_sbp_high),
      baselineDbpBand: bandOrNull(patient.baseline_dbp_low, patient.baseline_dbp_high),
      baselineHrBand: bandOrNull(
        patient.baseline_resting_hr_low,
        patient.baseline_resting_hr_high,
      ),
    },
    vitals: {
      weight: {
        yesterdayLb: mostRecentReading(yesterdayReadings, 'weight_lb'),
        baseline14dLb: baselineWeightRow ? Number(baselineWeightRow.value) : null,
        todayLb: mostRecentReading(todayReadings, 'weight_lb'),
      },
      pillows: {
        yesterdayCount: null, // pillow_count is on daily_logs row, not readings
        baseline7dCount:
          baselinePillows.length === 0
            ? null
            : Math.round(
                baselinePillows.reduce((s, v) => s + v, 0) / baselinePillows.length,
              ),
        todayCount: todayPillowCount,
      },
      bp: {
        yesterday: pairOrNull(
          mostRecentReading(yesterdayReadings, 'systolic_bp'),
          mostRecentReading(yesterdayReadings, 'diastolic_bp'),
        ),
        today: pairOrNull(
          mostRecentReading(todayReadings, 'systolic_bp'),
          mostRecentReading(todayReadings, 'diastolic_bp'),
        ),
      },
      hr: {
        yesterdayBpm: mostRecentReading(yesterdayReadings, 'resting_hr'),
        todayBpm: mostRecentReading(todayReadings, 'resting_hr'),
      },
      spo2: {
        yesterdayPct: mostRecentReading(yesterdayReadings, 'spo2'),
        todayPct: mostRecentReading(todayReadings, 'spo2'),
      },
    },
    symptoms: {
      dyspneaSeverity: dyspnea?.present ? dyspnea.severity ?? null : null,
      cough: coughEnum,
      sputumColor: (cough?.sputum_color as SymptomState['sputumColor']) ?? null,
      swellingSeverity: swelling?.present ? swelling.severity ?? null : null,
      swellingRegion: (swelling?.body_region as SymptomState['swellingRegion']) ?? null,
      swellingResolvesOvernight: swelling?.resolves_overnight ?? null,
      fatigueSeverity: fatigue?.present ? fatigue.severity ?? null : null,
      cognitionChange: cognitionEnum,
      appetiteChange: (todayAppetite as SymptomState['appetiteChange']) ?? null,
      urineOutputChange: (todayUrine as SymptomState['urineOutputChange']) ?? null,
      chestPain: chestPain ? chestPain.present : null,
      syncope: syncope ? syncope.present : null,
      cyanosis: cyanosis ? cyanosis.present : null,
      pnd: pnd ? pnd.present : null,
      earlySatiety: earlySatiety ? earlySatiety.present : null,
      extremitiesColdClammy: coldClammy ? coldClammy.present : null,
      pulseIrregular: pulseIrregular ? pulseIrregular.present : null,
      dizziness: dizziness ? dizziness.present : null,
      dizzinessPostural: dizziness?.postural ?? null,
      nausea: nausea ? nausea.present : null,
    },
    symptomSources: {
      dyspneaSeverity: dyspnea?.present ? sourceFor(dyspnea) : null,
      cough: cough ? sourceFor(cough) : null,
      sputumColor: cough?.sputum_color ? sourceFor(cough) : null,
      swellingSeverity: swelling?.present ? sourceFor(swelling) : null,
      swellingRegion: swelling?.body_region ? sourceFor(swelling) : null,
      swellingResolvesOvernight:
        swelling?.resolves_overnight !== null &&
        swelling?.resolves_overnight !== undefined
          ? sourceFor(swelling)
          : null,
      fatigueSeverity: fatigue?.present ? sourceFor(fatigue) : null,
      cognitionChange: cognitionEnum !== null ? sourceFor(cognition) : null,
      appetiteChange: null, // day-level field; no per-event source
      urineOutputChange: null, // day-level field; no per-event source
      chestPain: chestPain ? sourceFor(chestPain) : null,
      syncope: syncope ? sourceFor(syncope) : null,
      cyanosis: cyanosis ? sourceFor(cyanosis) : null,
      pnd: pnd ? sourceFor(pnd) : null,
      earlySatiety: earlySatiety ? sourceFor(earlySatiety) : null,
      extremitiesColdClammy: coldClammy ? sourceFor(coldClammy) : null,
      pulseIrregular: pulseIrregular ? sourceFor(pulseIrregular) : null,
      dizziness: dizziness ? sourceFor(dizziness) : null,
      dizzinessPostural:
        dizziness?.postural !== null && dizziness?.postural !== undefined
          ? sourceFor(dizziness)
          : null,
      nausea: nausea ? sourceFor(nausea) : null,
    },
    assessment: assessment
      ? {
          tier: assessment.tier as LogPageContext['assessment'] extends infer A
            ? A extends { tier: infer T }
              ? T
              : never
            : never,
          triggers: (assessment.triggers as AssessmentTrigger[]) ?? [],
          coldStart: assessment.cold_start as boolean,
        }
      : null,
    todayLogId: mostRecentToday?.id ?? null,
    todayLogStatus: (mostRecentToday?.processing_status as LogPageContext['todayLogStatus']) ?? null,
    todayLogIsVoice,
    transcript:
      typeof mostRecentToday?.transcribed_text === 'string'
        ? mostRecentToday.transcribed_text
        : null,
    caregiverSummary: obs?.caregiver_summary ?? null,
    dayN,
  };
}

function bandOrNull(
  lo: number | null | undefined,
  hi: number | null | undefined,
): [number, number] | null {
  if (lo === null || lo === undefined || hi === null || hi === undefined) return null;
  return [Number(lo), Number(hi)];
}

function pairOrNull(
  sys: number | null,
  dia: number | null,
): { sys: number; dia: number } | null {
  if (sys === null || dia === null) return null;
  return { sys, dia };
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
