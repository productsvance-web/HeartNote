import { NextResponse, type NextRequest } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

// Handles email-link callbacks (signup confirmation, password recovery, magic link).
// Per Supabase canonical Next.js pattern: ?token_hash=...&type=... + verifyOtp.
// (OAuth uses ?code= + exchangeCodeForSession on /auth/callback — that route still exists.)
function resolveOrigin(request: NextRequest): string {
  const url = new URL(request.url);
  const host =
    request.headers.get('x-forwarded-host') ??
    request.headers.get('host') ??
    url.host;
  const proto =
    request.headers.get('x-forwarded-proto') ??
    (url.protocol === 'https:' ? 'https' : 'http');
  return `${proto}://${host}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const errorParam = searchParams.get('error_description');

  if (errorParam) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorParam)}`
    );
  }
  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    // For recovery links, route to forgot-password with a clear "expired" message
    // so the user can request a fresh link in one click.
    if (type === 'recovery') {
      return NextResponse.redirect(
        `${origin}/auth/forgot-password?error=link_expired`
      );
    }
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  // Recovery: send to update-password (session is set; form requires it).
  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/auth/update-password`);
  }

  // Signup / email change / magic link: route by onboarding state, same as /auth/callback.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=session_failed`);
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', user.id)
    .single();

  return NextResponse.redirect(
    profile?.onboarding_completed_at ? `${origin}/dashboard` : `${origin}/onboarding`
  );
}
