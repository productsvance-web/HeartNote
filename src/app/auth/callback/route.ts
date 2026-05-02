import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';

// OAuth callback (?code=). Email confirmation + password recovery use 6-digit OTP
// codes verified via server actions — no URL callback for those.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request.headers);
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error_description');

  if (errorParam) {
    // Provider-side errors (consent denied, etc.) get mapped to a stable key
    // so we never leak raw provider strings into the URL.
    const lower = errorParam.toLowerCase();
    const key = lower.includes('access_denied') || lower.includes('cancelled')
      ? 'oauth_cancelled'
      : 'oauth_failed';
    return NextResponse.redirect(`${origin}/login?error=${key}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
  }

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
