// Compute today's calendar date in the caregiver's local timezone.
//
// Why this exists: `new Date().toISOString().slice(0, 10)` returns the UTC
// date, which crosses midnight at the wrong moment for any caregiver outside
// UTC. The `daily_logs` table has UNIQUE(patient_id, log_date) and the upsert
// in src/app/log/actions.ts uses that key — a UTC date string causes two
// distinct local-day recordings to collide and clobber each other.
//
// Source of truth for the timezone is `profiles.timezone` (NOT NULL, defaults
// to 'America/New_York' at the schema level). We fail closed: if the row is
// missing or the timezone is empty, throw rather than silently fall back to
// UTC and reintroduce the bug.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type Client = SupabaseClient<Database>;

/**
 * Format a Date as YYYY-MM-DD in the given IANA timezone.
 *
 * Uses the 'en-CA' locale because it natively renders dates in ISO 8601
 * (YYYY-MM-DD) format with `2-digit` parts, avoiding manual string assembly.
 */
export function formatDateInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns today's date (YYYY-MM-DD) in the given timezone. Use this when the
 * caller has already fetched `profiles.timezone` as part of another query.
 */
export function getTodayInTimezone(timeZone: string): string {
  if (!timeZone) {
    throw new Error('getTodayInTimezone: timeZone is required');
  }
  return formatDateInTimezone(new Date(), timeZone);
}

/**
 * Returns today's date (YYYY-MM-DD) in the caregiver's local timezone.
 * Reads `profiles.timezone` for the given caregiver user. Throws if the row
 * does not exist or the timezone column is empty — never silently falls back
 * to UTC.
 */
export async function getTodayForCaregiver(
  supabase: Client,
  caregiverId: string
): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', caregiverId)
    .single();

  if (error || !data) {
    throw new Error(
      `getTodayForCaregiver: profile not found for ${caregiverId}: ${error?.message ?? 'no row'}`
    );
  }
  if (!data.timezone) {
    throw new Error(`getTodayForCaregiver: profile ${caregiverId} has no timezone set`);
  }

  return getTodayInTimezone(data.timezone);
}
