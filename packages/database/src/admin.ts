import { createClient } from '@supabase/supabase-js'

/**
 * Default Supabase project URL.
 */
const DEFAULT_SUPABASE_URL = 'https://rkfwphowryckqkozscfi.supabase.co'

/**
 * Creates a Supabase client with service role key that bypasses RLS.
 *
 * ONLY use this in server-side API routes — never expose the service role
 * key to the client. Throws if SUPABASE_SERVICE_ROLE_KEY is not set.
 *
 * @source sharks-portal (lib/supabase/admin.ts)
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    }
  })
}
