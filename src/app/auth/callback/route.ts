import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';

// Single auth callback. Branches on params:
//   - ?code=<pkce>                       → Google OAuth (exchangeCodeForSession)
//   - ?token_hash=<hash>&type=magiclink  → email magic link (verifyOtp)
// Failures redirect to /login with a stable error key.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request.headers);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const errorParam = searchParams.get('error_description');

  if (errorParam) {
    const lower = errorParam.toLowerCase();
    const key = lower.includes('access_denied') || lower.includes('cancelled')
      ? 'oauth_cancelled'
      : 'oauth_failed';
    return NextResponse.redirect(`${origin}/login?error=${key}`);
  }

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=link_expired`);
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
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
