import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/api-auth'

// Force dynamic rendering - this route depends on user session
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // This route requires a valid session but doesn't require ops_users access
  // since it's the route that checks for ops_users access
  const supabaseAuth = await createServerClient()
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser()
  
  if (userError || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized - no valid session' }, { status: 401 })
  }

  // Check domain
  if (!user.email.endsWith('@shefaschool.org')) {
    return NextResponse.json({ error: 'Unauthorized - invalid domain' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    const emailLower = email.toLowerCase()
    
    console.log('[check-access] Checking access for:', emailLower)
    
    // First check ops_users table
    const { data, error } = await supabase
      .from('ops_users')
      .select('email, role, teams, is_active')
      .eq('email', emailLower)
      .eq('is_active', true)
      .single()

    console.log('[check-access] ops_users result:', { found: !!data, error: error?.message })

    if (!error && data) {
      console.log('[check-access] Found in ops_users with role:', data.role)
      return NextResponse.json({
        hasAccess: true,
        role: data.role,
        teams: data.teams || [],
      })
    }

    // Fallback: check if user is a super_admin (they get admin access to all portals)
    const { data: superAdmin, error: superError } = await supabase
      .from('super_admins')
      .select('email')
      .eq('email', emailLower)
      .maybeSingle()

    console.log('[check-access] super_admins result:', { found: !!superAdmin, error: superError?.message })

    if (superAdmin) {
      console.log('[check-access] Found in super_admins, granting admin role')
      return NextResponse.json({
        hasAccess: true,
        role: 'admin',
        teams: [], // Super admins see all teams
      })
    }

    console.log('[check-access] No access found for:', emailLower)
    return NextResponse.json({ 
      hasAccess: false, 
      role: null, 
      teams: [] 
    })
  } catch (error: any) {
    console.error('[check-access] Error:', error)
    return NextResponse.json({ 
      hasAccess: false, 
      role: null, 
      teams: [] 
    })
  }
}
