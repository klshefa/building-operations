import { createBrowserClient } from '@supabase/ssr'

interface CookieOptions {
  domain?: string
  path?: string
  secure?: boolean
  sameSite?: 'lax' | 'strict' | 'none'
  maxAge?: number
  expires?: Date
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rkfwphowryckqkozscfi.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4'
  
  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return document.cookie.split('; ').filter(c => c).map(c => {
          const [name, ...rest] = c.split('=')
          return { name, value: rest.join('=') }
        })
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options = {} }) => {
          // Build cookie string with all necessary options
          let cookieString = `${name}=${value}`
          
          // Don't set domain - let browser default to current hostname only
          // This prevents cross-subdomain cookie sharing
          
          cookieString += `; path=${options.path || '/'}`
          
          // Handle expiration - this is critical for session persistence
          if (options.maxAge !== undefined) {
            cookieString += `; max-age=${options.maxAge}`
          } else if (options.expires) {
            cookieString += `; expires=${options.expires.toUTCString()}`
          }
          
          // Security options
          if (options.secure !== false) {
            cookieString += `; secure`
          }
          cookieString += `; samesite=${options.sameSite || 'lax'}`
          
          document.cookie = cookieString
        })
      },
    },
  })
}
