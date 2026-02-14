import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/api-auth'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/events'

  console.log('Auth callback received, code present:', !!code)

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('OAuth exchange error:', error.message)
      return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
    }

    // Get user info after successful exchange
    const { data: { user } } = await supabase.auth.getUser()
    console.log('User after exchange:', user?.email)
    
    if (user?.email) {
      // Check domain restriction
      if (!user.email.endsWith('@shefaschool.org')) {
        console.log('Domain check failed for:', user.email)
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/?error=unauthorized_domain`)
      }

      // Check if user has access to Building Operations via ops_users
      // Use admin client to bypass RLS
      const adminClient = createAdminClient()
      const { data: accessData, error: accessError } = await adminClient
        .from('ops_users')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .eq('is_active', true)
        .maybeSingle()

      console.log('Access check result:', { accessData: !!accessData, accessError })

      if (!accessData) {
        // Also check super_admins for fallback access
        const { data: superAdmin } = await adminClient
          .from('super_admins')
          .select('*')
          .eq('email', user.email.toLowerCase())
          .maybeSingle()
        
        console.log('Super admin check:', !!superAdmin)
          
        if (!superAdmin) {
          return NextResponse.redirect(`${origin}/?error=no_access`)
        }
      }
      
      console.log('Access granted, redirecting to:', next)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  console.log('No code or no user, returning error')
  return NextResponse.redirect(`${origin}/?error=auth_callback_error`)
}
