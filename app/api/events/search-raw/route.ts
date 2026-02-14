import { NextResponse } from 'next/server'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

// GET: Search raw events
export async function GET(request: Request) {
  // Verify authentication
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || ''
    const date = searchParams.get('date') || ''
    const excludeEventId = searchParams.get('exclude_event_id') || ''
    const limit = parseInt(searchParams.get('limit') || '50')
    
    const supabase = createAdminClient()
    
    // Build the query
    let dbQuery = supabase
      .from('ops_raw_events')
      .select('*')
      .order('start_date', { ascending: false })
      .limit(limit)
    
    // Filter by title if query provided
    if (query) {
      dbQuery = dbQuery.ilike('title', `%${query}%`)
    }
    
    // Filter by date if provided
    if (date) {
      dbQuery = dbQuery.eq('start_date', date)
    }
    
    const { data: rawEvents, error } = await dbQuery
    
    if (error) {
      console.error('Search error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // If we have an exclude_event_id, filter out events already linked to it
    let results = rawEvents || []
    
    if (excludeEventId && results.length > 0) {
      // Get all raw events already linked to ANY event
      const { data: linkedEvents } = await supabase
        .from('ops_event_matches')
        .select('raw_event_id')
      
      const linkedIds = new Set(linkedEvents?.map(l => l.raw_event_id) || [])
      
      // Filter out already-linked events
      results = results.filter(r => !linkedIds.has(r.id))
    }
    
    return NextResponse.json({
      results,
      total: results.length
    })
    
  } catch (error: any) {
    console.error('Search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
