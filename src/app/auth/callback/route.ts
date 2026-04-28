import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Resolve the externally-visible base URL for redirects. In dev when we bind
// to 0.0.0.0, request.url reports the bind host instead of the actual host
// the user requested, so we prefer the Host header (or X-Forwarded-Host
// behind a proxy) and fall back to the URL only if those are missing.
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
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error_description');

  if (errorParam) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorParam)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
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

  if (!profile?.onboarding_completed_at) {
    return NextResponse.redirect(`${origin}/onboarding`);
  }
  return NextResponse.redirect(`${origin}/dashboard`);
}
