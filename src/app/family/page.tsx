import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { Users, Eye, Heart } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';
import { PhoneShell } from '@/components/heartnote/PhoneShell';
import { createShare } from './actions';
import { ShareRow } from './share-row';

export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarding_completed_at')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarding_completed_at) redirect('/onboarding');

  const { data: patient } = await supabase
    .from('patients')
    .select('id, display_name')
    .eq('caregiver_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (!patient) redirect('/onboarding');

  const { data: shares } = await supabase
    .from('family_shares')
    .select('id, share_token, recipient_label, expires_at, last_viewed_at, revoked_at, created_at')
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false });

  const origin = resolveOrigin(await headers());
  const all = (shares ?? []) as ShareDTO[];
  const { active, inactive } = partitionShares(all);

  const patientFirst = (patient.display_name?.trim().split(/\s+/)[0] ?? 'mom').toLowerCase();

  return (
    <PhoneShell>
      <header className="px-6 pt-8">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Family
        </p>
        <h1
          className="font-display text-[28px] text-foreground mt-1 leading-tight"
          style={{ letterSpacing: '-0.02em' }}
        >
          Share {patientFirst}&rsquo;s status with a sibling.
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          A read-only link your sister or brother can open without an account. No app, no
          install, no signup.
        </p>
      </header>

      {error && (
        <div
          className="mx-4 mt-4 rounded-2xl p-3 text-sm leading-relaxed"
          style={{
            background: 'var(--status-alert-soft)',
            color: 'var(--status-alert-foreground)',
          }}
        >
          {error === 'invalid'
            ? 'Pick an expiry option and try again.'
            : 'Could not save the share. Try again in a moment.'}
        </div>
      )}

      <form
        action={createShare}
        className="mx-4 mt-5 rounded-3xl bg-card border border-border shadow-card p-5 flex flex-col gap-3"
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Create a share link
        </p>
        <input
          type="text"
          name="recipient_label"
          placeholder='Who is this for? (e.g. "Sister Jen")'
          maxLength={80}
          className="rounded-2xl border border-border bg-background px-3 py-2.5 text-sm"
        />
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Expires
          </legend>
          <ExpiryRadio value="none" label="Never (until you revoke it)" defaultChecked />
          <ExpiryRadio value="7_days" label="In 7 days" />
          <ExpiryRadio value="30_days" label="In 30 days" />
        </fieldset>
        <button
          type="submit"
          className="mt-1 rounded-full px-4 py-2.5 text-sm font-medium active:scale-[0.98] transition"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
            boxShadow: 'var(--shadow-soft)',
          }}
        >
          Create link
        </button>
      </form>

      {active.length > 0 && (
        <section className="mt-5 px-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pb-2">
            Active shares
          </p>
          <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden">
            {active.map((s, i) => (
              <ShareRow
                key={s.id}
                shareId={s.id}
                recipientLabel={s.recipient_label}
                url={`${origin}/s/${s.share_token}`}
                expiresAt={s.expires_at}
                lastViewedAt={s.last_viewed_at}
                isLast={i === active.length - 1}
              />
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section className="mt-5 px-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1.5 pb-2">
            Revoked or expired
          </p>
          <div className="rounded-3xl bg-card border border-border shadow-card overflow-hidden opacity-70">
            {inactive.slice(0, 8).map((s, i) => (
              <div
                key={s.id}
                className="px-5 py-3"
                style={{
                  borderBottom:
                    i === Math.min(inactive.length, 8) - 1
                      ? 'none'
                      : '0.5px solid color-mix(in oklab, var(--border) 80%, transparent)',
                }}
              >
                <p className="text-sm text-muted-foreground">
                  {s.recipient_label ?? 'Untitled share'}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
                  <Eye size={11} />
                  {s.revoked_at !== null ? 'revoked' : 'expired'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section
        className="mx-4 mt-5 mb-6 rounded-3xl p-5"
        style={{
          background: 'color-mix(in oklab, var(--sage) 10%, var(--card))',
          border: '1px solid color-mix(in oklab, var(--sage) 24%, transparent)',
        }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5"
           style={{ color: 'var(--accent-foreground)' }}>
          <Heart size={11} fill="currentColor" />
          What the link shows
        </p>
        <ul className="mt-2 text-sm text-foreground leading-relaxed list-disc pl-5 marker:text-muted-foreground">
          <li>Mom&rsquo;s first name + today&rsquo;s status</li>
          <li>When the last check-in came in</li>
          <li>14-day weight pattern</li>
          <li>Top 3 symptoms from the last week</li>
        </ul>
        <p className="text-[11px] font-semibold uppercase tracking-wider mt-4 flex items-center gap-1.5"
           style={{ color: 'var(--muted-foreground)' }}>
          <Users size={11} />
          What it doesn&rsquo;t
        </p>
        <ul className="mt-2 text-xs text-muted-foreground leading-relaxed list-disc pl-5 marker:text-muted-foreground">
          <li>No medications · no cardiologist · no phone</li>
          <li>No voice-log transcripts · no severity numbers</li>
        </ul>
      </section>
    </PhoneShell>
  );
}

interface ShareDTO {
  id: string;
  share_token: string;
  recipient_label: string | null;
  expires_at: string | null;
  last_viewed_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

// Helper extracted out of the render so the react-hooks/purity rule
// doesn't reject the Date.now() call. Per-request anyway — this server
// component is force-dynamic.
function partitionShares(all: ShareDTO[]) {
  const nowMs = Date.now();
  const isActive = (s: ShareDTO) =>
    s.revoked_at === null &&
    (s.expires_at === null || new Date(s.expires_at).getTime() > nowMs);
  return {
    active: all.filter(isActive),
    inactive: all.filter((s) => !isActive(s)),
  };
}

function ExpiryRadio({
  value,
  label,
  defaultChecked = false,
}: {
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 rounded-xl border border-border bg-background px-3 py-2 text-sm cursor-pointer">
      <input
        type="radio"
        name="expiry_choice"
        value={value}
        required
        defaultChecked={defaultChecked}
        className="accent-primary"
      />
      {label}
    </label>
  );
}
