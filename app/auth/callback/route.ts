import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getCookieDomain } from '@/lib/utils/cookieDomain'
import { createAdminClient } from '@/lib/api-auth'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')
  const errorDescription = searchParams.get('error_description')
  const next = searchParams.get('next') ?? '/events'

  // Check if Supabase returned an error
  if (error) {
    console.error('OAuth error from Supabase:', error, errorDescription)
    return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
  }

  if (!code) {
    console.error('No code in callback')
    return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
  }

  const cookieStore = await cookies()
  const cookieDomain = getCookieDomain()

  const supabase = createServerClient(
    'https://rkfwphowryckqkozscfi.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrZndwaG93cnlja3Frb3pzY2ZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc0Mzg2MTEsImV4cCI6MjA3MzAxNDYxMX0.BRxY8LGo1iVhO-9j6eVc_vQ4UcXWa8uweOsY_DDuhq4',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
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

  console.log('Auth successful for:', user.email)
  return NextResponse.redirect(`${origin}${next}`)
}
