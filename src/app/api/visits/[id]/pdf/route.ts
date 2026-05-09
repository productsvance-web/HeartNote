// GET /api/visits/[id]/pdf — streams the rendered visit-handoff PDF.
//
// RLS does the gatekeeping: the route uses createClient (authenticated user
// context). A caregiver who doesn't own the visit gets `data: null` from the
// loader and a 404 here. We never use the service role; the PDF is private.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderVisitHandoffPDF } from '@/lib/visits/pdf/document';

// @react-pdf/renderer needs Node.js (uses fontkit + buffer); explicit so a
// future Edge default doesn't silently break this route.
export const runtime = 'nodejs';
// 30-day window query + 14 adherence RPC calls + react-pdf rendering. Typical
// run is well under 5s, but lift the cap so a cold-start under load doesn't
// trip the default 10s.
export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/login', _request.url), 302);
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', user.id)
      .maybeSingle();
    const tz = profile?.timezone ?? 'America/New_York';

    const result = await renderVisitHandoffPDF(supabase, id, tz);
    if (!result) {
      // RLS hides the visit from non-owners — same 404 as a missing visit so
      // we don't leak existence to other caregivers.
      return new NextResponse('Visit not found', { status: 404 });
    }

    const filename = buildFilename(
      result.data.patient.displayName,
      result.data.visit.visitDate,
    );
    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    // Land a structured log so Vercel runtime logs surface the actual cause —
    // unhandled throws in a route handler turn into bare 500s with no signal.
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[/api/visits/[id]/pdf] render failed', { id, message, stack });
    return new NextResponse(
      JSON.stringify({ error: 'Could not generate PDF.', detail: message }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      },
    );
  }
}

function buildFilename(displayName: string, visitDate: string): string {
  const first = (displayName.trim().split(/\s+/)[0] ?? 'patient').toLowerCase();
  const slug = first.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'patient';
  return `heartnote-${slug}-${visitDate}.pdf`;
}
