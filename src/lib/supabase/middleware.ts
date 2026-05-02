import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refresh the auth session on every matched request. Per Supabase's current Next.js
// guide: use getClaims() here (local JWT validation) instead of getUser() (network
// round-trip). getUser() remains correct in server components and server actions
// where authoritative identity matters; in middleware it would mean one Auth
// round-trip per page load.
//
// IMPORTANT (per Supabase docs): do not run code between createServerClient and
// getClaims(); do not mutate supabaseResponse before returning it.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();

  return supabaseResponse;
}
