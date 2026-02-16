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
    
    // Fetch subscriptions for this user (case-insensitive)
    const { data: subscriptions, error: subsError } = await supabase
      .from('event_subscriptions')
      .select('event_id')
      .ilike('user_email', email)
    
    if (subsError) {
      console.error('[User Subscriptions] Error:', subsError)
      return NextResponse.json({ events: [], subscriptionCount: 0 })
    }
    
    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ events: [], subscriptionCount: 0 })
    }
    
    // Get unique event IDs
    const eventIds = [...new Set(subscriptions.map(s => s.event_id))]
    
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
      console.error('[User Subscriptions] Events error:', eventsError)
      return NextResponse.json({ events: [], subscriptionCount: subscriptions.length })
    }
    
    return NextResponse.json({ 
      events: events || [], 
      subscriptionCount: subscriptions.length,
      futureEventCount: events?.length || 0
    })
    
  } catch (err: any) {
    console.error('[User Subscriptions] Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
