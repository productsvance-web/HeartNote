// Local notification scheduling for medication cadences.
//
// Wraps @capacitor/local-notifications. Web is a no-op
// (Capacitor.isNativePlatform() short-circuit). On iOS the OS handles
// delivery whether the app is open or closed.
//
// IDs: 31-bit FNV-1a hash of `med:{medId}:{occurrenceUnixSeconds}` so
// dedup against `getPending()` is stable across app launches without a
// DB-side notification table. `extra: { medicationId }` lets us cancel
// all of a med's notifications by filter.
//
// Cap policy: iOS has historically capped at 64 scheduled notifications
// per app. We schedule ~30 days of fires per med ordered soonest-first
// across all meds; if `schedule()` rejects with a cap-related error we
// stop and re-balance on the next App.resume event.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type PermissionStatus } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { createClient } from '@/lib/supabase/client';
import {
  isCadenceActiveOnDate,
  notificationIdFor,
  type CadenceKind,
  type DoseTime,
} from './cadence';

const NOTIFICATION_BODY = 'You have medications scheduled now';
const ROLLING_DAYS = 30;

interface MedRow {
  id: string;
  cadence_kind: string;
  cycle_on_days: number | null;
  cycle_off_days: number | null;
  interval_days: number | null;
  started_at: string | null;
  stopped_at: string | null;
  dose_times: Array<{
    time_of_day: string;
    quantity: number;
    ordinal: number;
    applies_to_dow: number | null;
  }>;
}

export type PermissionState = PermissionStatus['display'] | 'unsupported';

async function fetchActiveMeds(): Promise<MedRow[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('medications')
    .select(
      'id, cadence_kind, cycle_on_days, cycle_off_days, interval_days, started_at, stopped_at, dose_times:medication_dose_times(time_of_day, quantity, ordinal, applies_to_dow)'
    )
    .is('stopped_at', null);
  return (data ?? []).map((m) => ({
    id: m.id,
    cadence_kind: m.cadence_kind,
    cycle_on_days: m.cycle_on_days,
    cycle_off_days: m.cycle_off_days,
    interval_days: m.interval_days,
    started_at: m.started_at,
    stopped_at: m.stopped_at,
    dose_times: m.dose_times ?? [],
  }));
}

async function fetchOneMed(medicationId: string): Promise<MedRow | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from('medications')
    .select(
      'id, cadence_kind, cycle_on_days, cycle_off_days, interval_days, started_at, stopped_at, dose_times:medication_dose_times(time_of_day, quantity, ordinal, applies_to_dow)'
    )
    .eq('id', medicationId)
    .single();
  if (!data) return null;
  return {
    id: data.id,
    cadence_kind: data.cadence_kind,
    cycle_on_days: data.cycle_on_days,
    cycle_off_days: data.cycle_off_days,
    interval_days: data.interval_days,
    started_at: data.started_at,
    stopped_at: data.stopped_at,
    dose_times: data.dose_times ?? [],
  };
}

interface PlannedFire {
  medicationId: string;
  occurrenceMs: number;
  id: number;
}

// Compute the next ROLLING_DAYS of fires for a med, filtered by cadence
// rules. Returns occurrences in chronological order.
function computeFiresForMed(med: MedRow, from: Date): PlannedFire[] {
  if (med.cadence_kind === 'as_needed') return [];
  if (med.dose_times.length === 0) return [];
  const fires: PlannedFire[] = [];
  const horizon = new Date(from);
  horizon.setDate(horizon.getDate() + ROLLING_DAYS);

  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);

  while (cursor < horizon) {
    const dowBit = 1 << cursor.getDay();
    const active = isCadenceActiveOnDate({
      cadenceKind: med.cadence_kind as CadenceKind,
      startedAt: med.started_at,
      cycleOnDays: med.cycle_on_days,
      cycleOffDays: med.cycle_off_days,
      intervalDays: med.interval_days,
      date: cursor,
    });
    if (active) {
      for (const dt of med.dose_times) {
        if (med.cadence_kind === 'specific_days') {
          if (((dt.applies_to_dow ?? 0) & dowBit) === 0) continue;
        }
        const [hh, mm] = dt.time_of_day.split(':').map(Number);
        const at = new Date(cursor);
        at.setHours(hh, mm, 0, 0);
        if (at.getTime() <= from.getTime()) continue;
        const occurrenceUnixSeconds = Math.floor(at.getTime() / 1000);
        fires.push({
          medicationId: med.id,
          occurrenceMs: at.getTime(),
          id: notificationIdFor(med.id, occurrenceUnixSeconds),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return fires;
}

export async function checkPermissionState(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  const result = await LocalNotifications.checkPermissions();
  return result.display;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform()) return 'unsupported';
  const result = await LocalNotifications.requestPermissions();
  return result.display;
}

// Cancel all pending notifications for a med.
export async function cancelNotificationsForMed(medicationId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  const toCancel = pending.notifications.filter(
    (n) => (n.extra as { medicationId?: string } | undefined)?.medicationId === medicationId,
  );
  if (toCancel.length === 0) return;
  await LocalNotifications.cancel({ notifications: toCancel.map((n) => ({ id: n.id })) });
}

interface ScheduleResult {
  scheduled: number;
  capped: boolean;
  permissionDenied: boolean;
}

// Schedule the next ROLLING_DAYS of fires for a med. Caller is
// responsible for canceling prior fires first. Returns capped=true if
// the OS rejected a schedule call (assumed: 64-cap reached).
export async function scheduleNotificationsForMed(medicationId: string): Promise<ScheduleResult> {
  if (!Capacitor.isNativePlatform()) {
    return { scheduled: 0, capped: false, permissionDenied: false };
  }
  const permission = await checkPermissionState();
  if (permission !== 'granted') {
    return { scheduled: 0, capped: false, permissionDenied: true };
  }
  const med = await fetchOneMed(medicationId);
  if (!med) return { scheduled: 0, capped: false, permissionDenied: false };
  const fires = computeFiresForMed(med, new Date());
  return scheduleFires(fires);
}

// Schedule all active meds' next ROLLING_DAYS of fires, soonest-first
// across all meds. Used on app launch and on App.resume.
export async function topUpScheduledNotifications(): Promise<ScheduleResult> {
  if (!Capacitor.isNativePlatform()) {
    return { scheduled: 0, capped: false, permissionDenied: false };
  }
  const permission = await checkPermissionState();
  if (permission !== 'granted') {
    return { scheduled: 0, capped: false, permissionDenied: true };
  }
  const meds = await fetchActiveMeds();
  const now = new Date();
  const allFires = meds.flatMap((m) => computeFiresForMed(m, now));
  allFires.sort((a, b) => a.occurrenceMs - b.occurrenceMs);

  const pending = await LocalNotifications.getPending();
  const pendingIds = new Set(pending.notifications.map((n) => n.id));
  const missing = allFires.filter((f) => !pendingIds.has(f.id));
  return scheduleFires(missing);
}

async function scheduleFires(fires: PlannedFire[]): Promise<ScheduleResult> {
  if (fires.length === 0) return { scheduled: 0, capped: false, permissionDenied: false };
  let scheduled = 0;
  let capped = false;
  // Schedule in batches of 32 so a cap-related rejection on a later batch
  // doesn't waste prior successful work.
  for (let i = 0; i < fires.length; i += 32) {
    const batch = fires.slice(i, i + 32);
    try {
      await LocalNotifications.schedule({
        notifications: batch.map((f) => ({
          id: f.id,
          title: 'HeartNote',
          body: NOTIFICATION_BODY,
          schedule: { at: new Date(f.occurrenceMs), allowWhileIdle: true },
          extra: { medicationId: f.medicationId },
        })),
      });
      scheduled += batch.length;
    } catch (err) {
      const message = err instanceof Error ? err.message.toLowerCase() : '';
      if (message.includes('limit') || message.includes('cap') || message.includes('64')) {
        capped = true;
      }
      break;
    }
  }
  return { scheduled, capped, permissionDenied: false };
}

// Re-schedule all active meds (cancel + schedule). Returns aggregate
// result. Called after a cadence-changing edit when the caller can't
// know which prior fires belong to which med — simplest re-balance.
export async function rescheduleAll(): Promise<ScheduleResult> {
  if (!Capacitor.isNativePlatform()) {
    return { scheduled: 0, capped: false, permissionDenied: false };
  }
  const permission = await checkPermissionState();
  if (permission !== 'granted') {
    return { scheduled: 0, capped: false, permissionDenied: true };
  }
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }
  return topUpScheduledNotifications();
}

// Wire the App.resume event so notifications get topped up after the
// caregiver returns from the iOS Settings screen (or any background).
// Returns a teardown function for the caller to clean up.
export function setupResumeRescheduling(): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  const handle = App.addListener('resume', () => {
    void topUpScheduledNotifications();
  });
  return () => {
    void handle.then((h) => h.remove());
  };
}

// Re-export DoseTime for convenience to consumers.
export type { DoseTime };
