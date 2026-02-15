import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { subDays, format } from 'date-fns'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/events/recent-requests
// Returns events requested via self-service in the last 3 days
export async function GET() {
  try {
    const supabase = createAdminClient()
    const threeDaysAgo = format(subDays(new Date(), 3), 'yyyy-MM-dd')
    
    const { data, error } = await supabase
      .from('ops_events')
      .select('*')
      .not('requested_by', 'is', null)
      .gte('requested_at', `${threeDaysAgo}T00:00:00`)
      .order('requested_at', { ascending: false })
      .limit(10)
    
    if (error) {
      console.error('Error fetching recent requests:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ data: data || [] })
    
  } catch (error: any) {
    console.error('Recent requests API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
