import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role to bypass RLS
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface EventFilter {
  id: string
  filter_type: string
  filter_value: string
  case_sensitive: boolean
}

interface OpsEvent {
  id: string
  title: string
  description: string | null
  location: string | null
}

function eventMatchesFilter(event: OpsEvent, filter: EventFilter): boolean {
  const value = filter.case_sensitive ? filter.filter_value : filter.filter_value.toLowerCase()
  
  switch (filter.filter_type) {
    case 'title_contains': {
      const title = filter.case_sensitive ? event.title : event.title.toLowerCase()
      return title.includes(value)
    }
    case 'title_equals': {
      const title = filter.case_sensitive ? event.title : event.title.toLowerCase()
      return title === value
    }
    case 'description_contains': {
      if (!event.description) return false
      const desc = filter.case_sensitive ? event.description : event.description.toLowerCase()
      return desc.includes(value)
    }
    case 'location_contains': {
      if (!event.location) return false
      const loc = filter.case_sensitive ? event.location : event.location.toLowerCase()
      return loc.includes(value)
    }
    case 'location_equals': {
      if (!event.location) return false
      const loc = filter.case_sensitive ? event.location : event.location.toLowerCase()
      return loc === value
    }
    default:
      return false
  }
}

// POST - Apply all active filters to events
export async function POST() {
  const supabase = createAdminClient()
  
  try {
    // Get all active filters
    const { data: filters, error: filtersError } = await supabase
      .from('ops_event_filters')
      .select('*')
      .eq('is_active', true)
    
    if (filtersError) {
      return NextResponse.json({ error: filtersError.message }, { status: 500 })
    }
    
    if (!filters || filters.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No active filters to apply',
        hidden_count: 0 
      })
    }
    
    // Get all non-hidden events
    const { data: events, error: eventsError } = await supabase
      .from('ops_events')
      .select('id, title, description, location')
      .eq('is_hidden', false)
    
    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 })
    }
    
    if (!events || events.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No events to filter',
        hidden_count: 0 
      })
    }
    
    // Find events that match any filter
    const eventsToHide: string[] = []
    
    for (const event of events) {
      for (const filter of filters) {
        if (eventMatchesFilter(event, filter)) {
          eventsToHide.push(event.id)
          break // Only need to match one filter
        }
      }
    }
    
    if (eventsToHide.length > 0) {
      // Mark matching events as hidden
      const { error: updateError } = await supabase
        .from('ops_events')
        .update({ is_hidden: true, updated_at: new Date().toISOString() })
        .in('id', eventsToHide)
      
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Applied ${filters.length} filters`,
      hidden_count: eventsToHide.length,
      filters_applied: filters.map(f => f.name)
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
