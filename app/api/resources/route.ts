import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
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
