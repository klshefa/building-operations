import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/api-auth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rkfwphowryckqkozscfi.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const next = requestUrl.searchParams.get('next') ?? '/events'
  const origin = requestUrl.origin

  // Check if Supabase returned an error
  if (error) {
    console.error('OAuth error from Supabase:', error, errorDescription)
    return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
  }

  if (!code) {
    console.error('No code in callback')
    return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
  }

  // Track cookies to set on the response
  const cookiesToSet: Array<{ name: string; value: string; options: any }> = []
  const cookieStore = await cookies()

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            cookiesToSet.push({ name, value, options })
          })
        },
      },
    }
  )

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error('OAuth exchange error:', exchangeError.message)
    return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
  }

  // Get user info after successful exchange
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email) {
    console.error('No user email after exchange')
    return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
  }

  // Check domain restriction
  if (!user.email.endsWith('@shefaschool.org')) {
    console.log('Domain check failed for:', user.email)
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/?error=unauthorized_domain`)
  }

  // Check if user has access to Building Operations via ops_users
  const adminClient = createAdminClient()
  const { data: accessData } = await adminClient
    .from('ops_users')
    .select('*')
    .eq('email', user.email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle()

  if (!accessData) {
    // Also check super_admins for fallback access
    const { data: superAdmin } = await adminClient
      .from('super_admins')
      .select('*')
      .eq('email', user.email.toLowerCase())
      .maybeSingle()

    if (!superAdmin) {
      console.log('No access for:', user.email)
      return NextResponse.redirect(`${origin}/?error=no_access`)
    }
  }

  // Create redirect response and explicitly set all cookies
  const response = NextResponse.redirect(`${origin}${next}`)
  
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options)
  })

  console.log('Auth successful for:', user.email, '- setting', cookiesToSet.length, 'cookies')
  return response
}
