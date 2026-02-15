import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')
  
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }
  
  const today = new Date().toISOString().split('T')[0]
  
  try {
    const supabase = createAdminClient()
    
    // Fetch mentions for this user
    const { data: mentions, error: mentionsError } = await supabase
      .from('event_mentions')
      .select('event_id')
      .ilike('mentioned_email', email) // Case-insensitive match
    
    if (mentionsError) {
      console.error('[User Mentions] Error fetching mentions:', mentionsError)
      // Table might not exist - return empty
      return NextResponse.json({ events: [], mentionCount: 0 })
    }
    
    if (!mentions || mentions.length === 0) {
      return NextResponse.json({ events: [], mentionCount: 0 })
    }
    
    // Get unique event IDs
    const eventIds = [...new Set(mentions.map(m => m.event_id))]
    
    // Fetch those events (only future ones)
    const { data: events, error: eventsError } = await supabase
      .from('ops_events')
      .select('*')
      .in('id', eventIds)
      .gte('start_date', today)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true })
    
    if (eventsError) {
      console.error('[User Mentions] Error fetching events:', eventsError)
      return NextResponse.json({ events: [], mentionCount: mentions.length })
    }
    
    return NextResponse.json({ 
      events: events || [], 
      mentionCount: mentions.length,
      futureEventCount: events?.length || 0
    })
    
  } catch (err: any) {
    console.error('[User Mentions] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
