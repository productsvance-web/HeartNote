// Per-request reader for "is today's assessment a red alert?". Wrapped
// in React `cache()` so multiple components in the same request (e.g.,
// PhoneShell plus a page that already queries the assessment) share one
// set of DB round-trips.
//
// Used by PhoneShell to decide whether to render <AlertGlow />. Returns
// the literal tier string (or null) rather than a boolean so future
// callers can branch on tier_2 / tier_3 without a second helper.

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';

export type AssessmentTier =
  | 'tier_1_911'
  | 'tier_2_today'
  | 'tier_3_48hr'
  | 'tier_4_log';

export const getCurrentTier = cache(async (): Promise<AssessmentTier | null> => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.timezone) return null;

    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('caregiver_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!patient) return null;

    const today = getTodayInTimezone(profile.timezone);
    const { data: assessment } = await supabase
      .from('daily_assessments')
      .select('tier')
      .eq('patient_id', patient.id)
      .eq('log_date', today)
      .maybeSingle();

    return (assessment?.tier as AssessmentTier | undefined) ?? null;
  } catch (err) {
    // Fail closed visually — no glow rather than crash a server render.
    console.error('[alert-glow] tier read failed', err);
    return null;
  }
});
