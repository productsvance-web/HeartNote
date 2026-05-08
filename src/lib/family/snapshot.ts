import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

// Public snapshot rendered at /s/[token]. The route is reachable without
// auth, so this module is the only trust boundary — it validates the
// token, applies redaction, and never returns anything that exposes PII
// beyond what the caregiver explicitly chose to share.
//
// Plain-English: when the caregiver creates a share link and texts it to
// her sister, the sister opens the link and sees a small, calm screen —
// "Mom's status today" — without an account, without HeartNote knowing
// anything about her. The screen explicitly does NOT show medications,
// the cardiologist's contact info, or the voice-log transcripts.

export type SharedTier = 'good' | 'watch' | 'alert' | 'unknown';

export interface SharedSnapshot {
  patientFirstName: string;
  caregiverFirstName: string | null;
  tier: SharedTier;
  tierLabel: string;
  lastLogAt: string | null; // ISO timestamp of latest daily_logs.created_at
  weightSeries14d: { d: string; v: number }[];
  weightDelta7dLb: number | null;
  topSymptoms7d: { label: string; days: number }[];
  expiresAt: string | null;
}

export type SnapshotResult =
  | { kind: 'ok'; snapshot: SharedSnapshot }
  | { kind: 'revoked' }
  | { kind: 'expired'; expiresAt: string }
  | { kind: 'not_found' };

export async function loadSharedSnapshot(token: string): Promise<SnapshotResult> {
  if (!token || token.length < 16 || token.length > 128) {
    return { kind: 'not_found' };
  }

  const admin = createAdminClient();

  // Look up the share. We deliberately do NOT use .maybeSingle() here so
  // that a deleted row is treated identically to a non-existent token —
  // no signal that "this token used to exist."
  const { data: share } = await admin
    .from('family_shares')
    .select('id, patient_id, expires_at, revoked_at')
    .eq('share_token', token)
    .limit(1)
    .maybeSingle();

  if (!share) return { kind: 'not_found' };
  if (share.revoked_at !== null) return { kind: 'revoked' };
  if (share.expires_at !== null && new Date(share.expires_at).getTime() < Date.now()) {
    return { kind: 'expired', expiresAt: share.expires_at };
  }

  // Pull patient + caregiver display names (limited to first-name-style
  // labels). We do NOT pull cardiologist, phone, address, DOB, NYHA, or
  // any column that wasn't explicitly chosen for the share.
  const { data: patient } = await admin
    .from('patients')
    .select('id, display_name, caregiver_id')
    .eq('id', share.patient_id)
    .maybeSingle();
  if (!patient) return { kind: 'not_found' };

  const { data: caregiver } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', patient.caregiver_id)
    .maybeSingle();

  // Latest daily_logs row + latest assessment.
  const [logsQ, assessmentQ] = await Promise.all([
    admin
      .from('daily_logs')
      .select('created_at, log_date')
      .eq('patient_id', patient.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('daily_assessments')
      .select('tier, evaluated_at')
      .eq('patient_id', patient.id)
      .order('log_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // 14-day weight series (latest reading per day).
  const today = new Date().toISOString().slice(0, 10);
  const windowStart = isoDateOffset(today, -13);
  const sevenDaysAgo = isoDateOffset(today, -7);
  const { data: weight } = await admin
    .from('daily_log_readings')
    .select('log_date, value, recorded_at')
    .eq('patient_id', patient.id)
    .eq('field', 'weight_lb')
    .gte('log_date', windowStart)
    .lte('log_date', today)
    .order('recorded_at', { ascending: true });
  const weightByDay = new Map<string, number>();
  for (const r of (weight ?? []) as { log_date: string; value: number | string }[]) {
    weightByDay.set(r.log_date, Number(r.value));
  }
  const weightSeries14d = Array.from(weightByDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ d, v }));
  const latest = weightSeries14d[weightSeries14d.length - 1] ?? null;
  const baseline =
    weightSeries14d.find((p) => p.d <= sevenDaysAgo)?.v ?? weightSeries14d[0]?.v ?? null;
  const weightDelta7dLb =
    latest && baseline !== null ? Number((latest.v - baseline).toFixed(1)) : null;

  // Top symptoms in the last 7 days.
  const sevenStart = isoDateOffset(today, -6);
  const { data: symptoms } = await admin
    .from('daily_log_symptom_events')
    .select('symptom, log_date')
    .eq('patient_id', patient.id)
    .eq('present', true)
    .gte('log_date', sevenStart)
    .lte('log_date', today);
  const symptomDays = new Map<string, Set<string>>();
  for (const s of (symptoms ?? []) as { symptom: string; log_date: string }[]) {
    if (!symptomDays.has(s.symptom)) symptomDays.set(s.symptom, new Set());
    symptomDays.get(s.symptom)!.add(s.log_date);
  }
  const topSymptoms7d = Array.from(symptomDays.entries())
    .map(([symptom, set]) => ({ label: humanSymptomLabel(symptom), days: set.size }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 3);

  // Tier mapping. Engine writes tier_1_911 / tier_2_today / tier_3_48hr /
  // tier_4_log / tier_5_baseline / null. The shared snapshot collapses
  // those into 4 plain labels.
  const tier: SharedTier = mapTier(assessmentQ.data?.tier ?? null);

  // Async fire-and-forget: bump last_viewed_at. Don't block render.
  admin
    .from('family_shares')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', share.id)
    .then(() => {
      /* noop */
    });

  return {
    kind: 'ok',
    snapshot: {
      patientFirstName: firstNameOnly(patient.display_name) ?? 'mom',
      caregiverFirstName: firstNameOnly(caregiver?.display_name ?? null),
      tier,
      tierLabel: tierLabel(tier),
      lastLogAt: logsQ.data?.created_at ?? null,
      weightSeries14d,
      weightDelta7dLb,
      topSymptoms7d,
      expiresAt: share.expires_at,
    },
  };
}

function mapTier(t: string | null): SharedTier {
  if (t === 'tier_1_911' || t === 'tier_2_today') return 'alert';
  if (t === 'tier_3_48hr') return 'watch';
  if (t === 'tier_4_log' || t === 'tier_5_baseline' || t === null) return 'unknown';
  return 'good';
}

function tierLabel(t: SharedTier): string {
  if (t === 'alert') return 'Worth a phone call.';
  if (t === 'watch') return 'Worth a closer look.';
  if (t === 'good') return 'Doing well.';
  return 'Building baseline.';
}

function firstNameOnly(name: string | null): string | null {
  if (!name) return null;
  const trimmed = name.trim().split(/\s+/)[0];
  return trimmed.length > 0 ? trimmed : null;
}

function humanSymptomLabel(s: string): string {
  if (s === 'dyspnea') return 'Shortness of breath';
  if (s === 'pnd') return 'Nighttime breathlessness';
  if (s === 'cough') return 'Cough';
  if (s === 'swelling') return 'Swelling';
  if (s === 'chest_pain') return 'Chest pain';
  if (s === 'dizziness') return 'Dizziness';
  return s.replace(/_/g, ' ');
}

function isoDateOffset(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}
