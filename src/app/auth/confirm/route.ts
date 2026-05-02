import { NextResponse, type NextRequest } from 'next/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { resolveOrigin } from '@/lib/auth/origin';
import { RECOVERY_COOKIE, RECOVERY_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth/recovery-cookie';

// Email-link callbacks (signup confirmation, password recovery). Per Supabase
// canonical Next.js pattern: ?token_hash=...&type=... + verifyOtp.
// (OAuth uses ?code= + exchangeCodeForSession on /auth/callback.)

const ALLOWED_TYPES = new Set<EmailOtpType>(['signup', 'recovery', 'email_change', 'invite']);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request.headers);
  const token_hash = searchParams.get('token_hash');
  const rawType = searchParams.get('type');
  const errorParam = searchParams.get('error_description');

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?error=confirm_failed`);
  }
  if (!token_hash || !rawType) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }

  // Validate type before passing to Supabase. Defense-in-depth.
  if (!ALLOWED_TYPES.has(rawType as EmailOtpType)) {
    return NextResponse.redirect(`${origin}/login?error=missing_token`);
  }
  const type = rawType as EmailOtpType;

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });
  if (error) {
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/auth/forgot-password?error=link_expired`);
    }
    return NextResponse.redirect(`${origin}/login?error=confirm_failed`);
  }

  // Recovery: set a short-lived cookie that /auth/update-password gates on,
  // then route to the password-set form.
  if (type === 'recovery') {
    const response = NextResponse.redirect(`${origin}/auth/update-password`);
    response.cookies.set(RECOVERY_COOKIE, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: RECOVERY_COOKIE_MAX_AGE_SECONDS,
      path: '/auth/update-password',
    });
    return response;
  }

  // Signup / invite / email-change: route by onboarding state.
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
