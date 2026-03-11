import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getCookieDomain } from './cookieDomain'

/**
 * Default Supabase project URL.
 */
const DEFAULT_SUPABASE_URL = 'https://rkfwphowryckqkozscfi.supabase.co'

/**
 * Default Supabase anon key.
 */
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4'

/**
 * Creates a server-side Supabase client (for Server Components, Route Handlers,
 * and Server Actions) with SSO-aware cookie handling.
 *
 * Uses the Next.js cookies() API to read and write auth cookies. The setAll
 * handler is wrapped in a try/catch because it will throw when called from a
 * Server Component (read-only context); this is expected and safe when
 * middleware is configured to refresh sessions.
 *
 * @source dismissal-app, attendance-portal, sharks-portal
 *         (lib/supabase/server.ts — canonical merged version)
 */
export async function createClient() {
  const cookieStore = await cookies()
  const cookieDomain = getCookieDomain()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

  return createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set({
                name,
                value,
                ...options,
                domain: cookieDomain,
                secure: true,
                sameSite: 'lax',
                path: '/',
              })
            })
          } catch {
            // Expected in Server Components (read-only cookie context).
            // Sessions are refreshed by middleware instead.
          }
        },
      },
    }
  )
}
