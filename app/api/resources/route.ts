import { NextResponse } from 'next/server'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

export async function GET() {
  // Verify authentication
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
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
