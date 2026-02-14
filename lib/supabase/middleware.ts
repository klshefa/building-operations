import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: CookieOptions }

// Fallback values for development
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rkfwphowryckqkozscfi.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refreshing the auth token
  const { data: { user } } = await supabase.auth.getUser()

  // Public paths that don't require authentication
  const publicPaths = ['/auth/callback']
  const isPublicPath = publicPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  )

  // If it's a public path, allow through
  if (isPublicPath) {
    return supabaseResponse
  }

  // All other paths require authentication
  // The root path (/) is the login page - allow if not authenticated
  if (request.nextUrl.pathname === '/' && !user) {
    return supabaseResponse
  }

  // If not authenticated and trying to access protected route, redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('error', 'session_expired')
    return NextResponse.redirect(url)
  }

  // Domain restriction check for authenticated users
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'shefaschool.org'
  const email = user.email?.toLowerCase() || ''
  
  if (!email.endsWith(`@${allowedDomain}`)) {
    // Sign out and redirect
    await supabase.auth.signOut()
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('error', 'unauthorized_domain')
    return NextResponse.redirect(url)
  }

  // If authenticated user is on login page, redirect to events
  if (request.nextUrl.pathname === '/' && user) {
    const url = request.nextUrl.clone()
    url.pathname = '/events'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
