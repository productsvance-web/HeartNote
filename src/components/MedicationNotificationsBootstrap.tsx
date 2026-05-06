'use client';

import { useEffect } from 'react';
import {
  setupResumeRescheduling,
  topUpScheduledNotifications,
} from '@/lib/medications/notifications';

// On app launch and on App.resume, top up the next 30 days of medication
// notifications so a caregiver who returns to the app after the rolling
// window depleted (or who toggled iOS notification permission in
// Settings) sees their reminders re-balanced. No-op on web — Capacitor's
// LocalNotifications plugin doesn't fire there.

export function MedicationNotificationsBootstrap() {
  useEffect(() => {
    void topUpScheduledNotifications();
    return setupResumeRescheduling();
  }, []);
  return null;
}
