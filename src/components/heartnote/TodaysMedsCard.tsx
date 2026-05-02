// Server wrapper: fetches today's adherence per med via the
// medication_adherence_for_day RPC and hands the rows to the client list
// component which renders + handles dose-confirm taps.

import Link from 'next/link';
import { Pill } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { evaluateMedAdherenceForDay } from '@/lib/medications/evaluate';
import { TodaysMedsList } from './TodaysMedsList';

interface Props {
  patientId: string;
  tz: string;
  date: string; // YYYY-MM-DD in patient tz
}

export async function TodaysMedsCard({ patientId, tz, date }: Props) {
  const supabase = await createClient();
  const rows = await evaluateMedAdherenceForDay(supabase, patientId, { date, tz });

  const scheduled = rows.filter((r) => r.dosesPerDay !== null);
  const prn = rows.filter((r) => r.dosesPerDay === null);

  if (rows.length === 0) {
    return (
      <section className="mx-4 mt-4 rounded-3xl bg-card shadow-card p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-muted">
            <Pill size={18} className="text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">No medications added yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add the meds your loved one takes so dose tracking can show up here.
            </p>
            <Link
              href="/me/medications"
              className="mt-3 inline-block text-sm text-foreground underline underline-offset-2"
            >
              Add medications →
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-4 mt-4 rounded-3xl bg-card shadow-card overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Today&rsquo;s meds
        </h2>
        <Link href="/me/medications" className="text-xs text-muted-foreground underline">
          Manage
        </Link>
      </div>
      <TodaysMedsList scheduled={scheduled} prn={prn} tz={tz} />
    </section>
  );
}
