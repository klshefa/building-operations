import { createBrowserClient } from '@supabase/ssr'

function getCookieDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const hostname = window.location.hostname
  if (hostname === 'localhost' || hostname === '127.0.0.1') return undefined
  if (hostname.endsWith('.vercel.app')) return '.vercel.app'
  if (hostname.endsWith('.shefaschool.org')) return '.shefaschool.org'
  return undefined
}

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rkfwphowryckqkozscfi.supabase.co'
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4'
  
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
            sameSite: 'lax' as const,
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
