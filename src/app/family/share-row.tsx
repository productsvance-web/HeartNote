'use client';

import { useState, useTransition } from 'react';
import { Copy, Share2, Eye, Trash2 } from 'lucide-react';
import { revokeShare } from './actions';

interface Props {
  shareId: string;
  recipientLabel: string | null;
  url: string;
  expiresAt: string | null;
  lastViewedAt: string | null;
  isLast: boolean;
}

export function ShareRow({
  shareId,
  recipientLabel,
  url,
  expiresAt,
  lastViewedAt,
  isLast,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  function share() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      navigator
        .share({
          title: "Mom's HeartNote check-in",
          text: 'A small read on how mom is doing today.',
          url,
        })
        .catch(() => {
          // User canceled or unsupported — fallback to copy.
          copy();
        });
    } else {
      copy();
    }
  }

  function doRevoke() {
    setError(null);
    startTransition(async () => {
      const res = await revokeShare({ shareId });
      if (res.error) setError(res.error);
    });
  }

  return (
    <div
      className="px-5 py-4"
      style={{
        borderBottom: isLast
          ? 'none'
          : '0.5px solid color-mix(in oklab, var(--border) 80%, transparent)',
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {recipientLabel ?? 'Untitled share'}
        </p>
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {expiresAt ? `expires ${shortDate(expiresAt)}` : 'no expiry'}
        </p>
      </div>
      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
        <Eye size={11} />
        {lastViewedAt ? `viewed ${timeAgo(lastViewedAt)}` : 'not viewed yet'}
      </p>
      <p
        className="text-xs mt-2 break-all rounded-xl bg-background border border-border px-3 py-2 font-mono"
        style={{ color: 'var(--muted-foreground)' }}
      >
        {url}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border border-border bg-card"
        >
          <Copy size={13} />
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
          style={{
            background: 'var(--primary)',
            color: 'var(--primary-foreground)',
          }}
        >
          <Share2 size={13} />
          Send
        </button>
        {!confirmingRevoke ? (
          <button
            type="button"
            onClick={() => setConfirmingRevoke(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground"
          >
            <Trash2 size={13} />
            Revoke
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={doRevoke}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              style={{
                background: 'var(--status-alert)',
                color: 'white',
                opacity: pending ? 0.7 : 1,
              }}
            >
              {pending ? 'Revoking…' : `Revoke ${recipientLabel ?? 'this share'}?`}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingRevoke(false)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground"
            >
              Cancel
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--status-alert-foreground)' }}>
          {error}
        </p>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 60) return min <= 1 ? '1 min ago' : `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return shortDate(iso);
}

const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;
}
