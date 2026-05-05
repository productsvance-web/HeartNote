import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Service-role client. Bypasses RLS. Server-only — `import 'server-only'`
// makes any client-bundle import a build-time error.
//
// Lazy: env vars validated and the client constructed on each call rather
// than at module load. Decouples consumers (e.g. /me/page.tsx → me/actions.ts
// transitively reaching this module) from requiring SUPABASE_SERVICE_ROLE_KEY
// at import time. Sign-out paths that share a module with admin code don't
// fail when the secret is absent — only the actual admin call does.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
