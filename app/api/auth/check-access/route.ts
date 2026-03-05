import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
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
      // Fallback: check super_admins (matches verifyApiAuth behavior)
      const { data: superAdmin } = await supabase
        .from('super_admins')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle()

      if (superAdmin) {
        return NextResponse.json({
          hasAccess: true,
          role: 'admin',
          teams: [],
        })
      }

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
