import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getTodayInTimezone } from '@/lib/dates/today';
import { loadLogPageContext } from '@/lib/log/page-context';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { LogPageClient } from './log-page-client';

// Server shell for the unified /log page. Loads patient context + today's
// vitals + symptoms + assessment via loadLogPageContext, then hands the
// flat context object to LogPageClient. The page header (eyebrow,
// headline, subhead) lives inside the client because it depends on
// recording state.

export default async function LogPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const today = getTodayInTimezone(profile.timezone);
  const ctx = await loadLogPageContext(supabase, user.id, today, profile.timezone);
  if (!ctx) redirect('/onboarding');

  return (
    <PhoneShell hideNav>
      <LogPageClient context={ctx} />
    </PhoneShell>
  );
}
