import 'server-only';

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

// Service-role client. Bypasses RLS. Server-only — `import 'server-only'`
// makes any client-bundle import a build-time error.
export const adminClient = createClient<Database>(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
