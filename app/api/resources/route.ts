import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyApiAuth, isAuthError } from '@/lib/api-auth'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  try {
    const auth = await verifyApiAuth(request)
    if (isAuthError(auth)) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('ops_resources')
      .select('*')
      .order('description')

    if (error) {
      console.error('Error fetching resources:', error)
      return NextResponse.json({ 
        data: [], 
        error: error.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      data: data || [],
      error: null
    })
  } catch (error: any) {
    console.error('Resources API error:', error)
    return NextResponse.json({ 
      data: [], 
      error: error.message || 'Failed to fetch resources'
    }, { status: 500 })
  }
}
