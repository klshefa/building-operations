import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getCookieDomain } from '@/lib/utils/cookieDomain'

export async function createClient() {
  const cookieStore = await cookies()
  const cookieDomain = getCookieDomain()

  return createServerClient(
    'https://rkfwphowryckqkozscfi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4',
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
            // Server component
          }
        },
      },
    }
  )
}

