import { createBrowserClient } from '@supabase/ssr'
import { getCookieDomain } from './cookieDomain'

/**
 * Default Supabase project URL.
 * Used as a fallback when NEXT_PUBLIC_SUPABASE_URL is not set
 * (e.g. during static page generation / prerendering).
 */
const DEFAULT_SUPABASE_URL = 'https://rkfwphowryckqkozscfi.supabase.co'

/**
 * Default Supabase anon key.
 * Used as a fallback when NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.
 */
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4'

/**
 * Creates a browser-side Supabase client with SSO-aware cookie handling.
 *
 * Cookies are scoped to the shared root domain in production so that
 * auth sessions work across all Shefa portal subdomains.
 *
 * @source dismissal-app, attendance-portal, sharks-portal
 *         (lib/supabase/client.ts — canonical merged version)
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return document.cookie.split('; ').map(c => {
          const [name, ...rest] = c.split('=')
          return { name, value: rest.join('=') }
        })
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        const cookieDomain = getCookieDomain()

        cookiesToSet.forEach(({ name, value, options }) => {
          const cookieOptions = {
            ...options,
            domain: cookieDomain,
            secure: true,
            sameSite: 'none' as const,
            path: '/',
          }

          let cookieString = `${name}=${value}`
          if (cookieOptions.domain) cookieString += `; domain=${cookieOptions.domain}`
          if (cookieOptions.path) cookieString += `; path=${cookieOptions.path}`
          if (cookieOptions.secure) cookieString += `; secure`
          if (cookieOptions.sameSite) cookieString += `; samesite=${cookieOptions.sameSite}`

          document.cookie = cookieString
        })
      },
    },
  })
}
