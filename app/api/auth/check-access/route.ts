import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/api-auth'

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
    
    const { data, error } = await supabase
      .from('ops_users')
      .select('email, role, teams, is_active')
      .eq('email', email.toLowerCase())
      .eq('is_active', true)
      .single()

    if (error || !data) {
      return NextResponse.json({ 
        hasAccess: false, 
        role: null, 
        teams: [] 
      })
    }

    return NextResponse.json({
      hasAccess: true,
      role: data.role,
      teams: data.teams || [],
    })
  } catch (error: any) {
    console.error('Check access error:', error)
    return NextResponse.json({ 
      hasAccess: false, 
      role: null, 
      teams: [] 
    })
  }
}
