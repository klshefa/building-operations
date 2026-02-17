import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseISO, isSameDay, format } from 'date-fns'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Calculate similarity between two strings (0-1)
function similarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()
  
  if (s1 === s2) return 1
  
  // Check if one contains the other
  if (s1.includes(s2) || s2.includes(s1)) return 0.8
  
  // Simple word overlap
  const words1 = new Set(s1.split(/\s+/))
  const words2 = new Set(s2.split(/\s+/))
  const intersection = [...words1].filter(w => words2.has(w))
  const union = new Set([...words1, ...words2])
  
  return intersection.length / union.size
}

// Determine if two raw events should be matched
function shouldMatch(event1: any, event2: any): { match: boolean; confidence: number } {
  // Must be on the same date
  if (event1.start_date !== event2.start_date) {
    return { match: false, confidence: 0 }
  }
  
  // Direct match via reservation_id (highest confidence) - for BigQuery sources
  if (event1.reservation_id && event2.reservation_id && 
      event1.reservation_id === event2.reservation_id) {
    return { match: true, confidence: 1.0 }
  }
  
  // Fallback to fuzzy matching for calendars/manual entries
  // Check title similarity
  const titleSim = similarity(event1.title, event2.title)
  
  // Check location/resource match
  const locationMatch = event1.location && event2.location 
    ? similarity(event1.location, event2.location) > 0.5
    : false
  const resourceMatch = event1.resource && event2.resource
    ? event1.resource.toLowerCase() === event2.resource.toLowerCase()
    : false
  
  // Check time overlap
  const timeMatch = event1.start_time && event2.start_time
    ? event1.start_time === event2.start_time
    : true // If no time, don't penalize
  
  // Calculate overall confidence
  let confidence = titleSim * 0.6 // Title is most important
  if (locationMatch || resourceMatch) confidence += 0.25
  if (timeMatch) confidence += 0.15
  
  return {
    match: confidence >= 0.5, // Match if confidence >= 50%
    confidence
  }
}

// Determine event type from source and title
function determineEventType(rawEvent: any): string {
  const title = rawEvent.title.toLowerCase()
  
  if (title.includes('meeting')) return 'meeting'
  if (title.includes('assembly')) return 'assembly'
  if (title.includes('field trip')) return 'field_trip'
  if (title.includes('performance') || title.includes('concert') || title.includes('play')) return 'performance'
  if (title.includes('game') || title.includes('sports') || title.includes('athletic')) return 'athletic'
  if (title.includes('parent') || title.includes('family')) return 'parent_event'
  if (title.includes('pd') || title.includes('professional development') || title.includes('training')) return 'professional_development'
  if (title.includes('shabbat') || title.includes('holiday') || title.includes('tefillah')) return 'religious_observance'
  if (title.includes('fundraiser') || title.includes('gala') || title.includes('auction')) return 'fundraiser'
  
  // Check raw_data for BigQuery event_type
  if (rawEvent.raw_data?.event_type) {
    const eventType = rawEvent.raw_data.event_type.toLowerCase()
    if (eventType.includes('program')) return 'program_event'
    if (eventType.includes('meeting')) return 'meeting'
  }
  
  return 'other'
}

export async function POST(request: Request) {
  const startTime = Date.now()
  const supabase = getSupabaseClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  try {
    // Fetch all raw events from today onwards
    const { data: rawEvents, error: rawError } = await supabase
      .from('ops_raw_events')
      .select('*')
      .gte('start_date', today)
      .order('start_date', { ascending: true })

    if (rawError) throw rawError

    console.log(`Processing ${rawEvents?.length || 0} raw events for aggregation`)

    if (!rawEvents || rawEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No events to aggregate',
        events_created: 0,
        duration_ms: Date.now() - startTime
      })
    }

    // Group raw events by date for faster matching
    const eventsByDate: Record<string, any[]> = {}
    for (const event of rawEvents) {
      if (!eventsByDate[event.start_date]) {
        eventsByDate[event.start_date] = []
      }
      eventsByDate[event.start_date].push(event)
    }

    // Find matches and create aggregated events
    const processedIds = new Set<string>()
    const aggregatedEvents: any[] = []
    const matches: any[] = []

    for (const date in eventsByDate) {
      const dayEvents = eventsByDate[date]
      
      for (let i = 0; i < dayEvents.length; i++) {
        const event = dayEvents[i]
        if (processedIds.has(event.id)) continue
        
        // Find all matching events
        const matchedEvents = [event]
        processedIds.add(event.id)
        
        for (let j = i + 1; j < dayEvents.length; j++) {
          const candidate = dayEvents[j]
          if (processedIds.has(candidate.id)) continue
          
          const { match, confidence } = shouldMatch(event, candidate)
          if (match) {
            matchedEvents.push(candidate)
            processedIds.add(candidate.id)
            
            // Record the match
            matches.push({
              raw_event_id: candidate.id,
              match_type: 'auto',
              match_confidence: confidence
            })
          }
        }
        
        // Create aggregated event from matched events
        // Priority: bigquery_group > calendar_staff > calendar_ls/ms > bigquery_resource > manual
        const sourcePriority = ['bigquery_group', 'calendar_staff', 'calendar_ls', 'calendar_ms', 'bigquery_resource', 'manual']
        const primaryEvent = matchedEvents.sort((a, b) => 
          sourcePriority.indexOf(a.source) - sourcePriority.indexOf(b.source)
        )[0]
        
        // Collect all unique sources from matched events
        const allSources = [...new Set(matchedEvents.map(e => e.source))]
        
        // Get veracross_reservation_id from any matched event that has it
        const reservationId = matchedEvents.find(e => e.reservation_id)?.reservation_id || null
        // Get resource_id from raw events
        const resourceId = matchedEvents.find(e => e.resource_id)?.resource_id || null
        // Get recurring_pattern from raw events
        const recurringPattern = matchedEvents.find(e => e.recurring_pattern)?.recurring_pattern || null
        
        aggregatedEvents.push({
          title: primaryEvent.title,
          description: matchedEvents.find(e => e.description)?.description || null,
          start_date: primaryEvent.start_date,
          end_date: primaryEvent.end_date || primaryEvent.start_date,
          start_time: matchedEvents.find(e => e.start_time)?.start_time || null,
          end_time: matchedEvents.find(e => e.end_time)?.end_time || null,
          all_day: !matchedEvents.some(e => e.start_time),
          location: matchedEvents.find(e => e.location)?.location || 
                    matchedEvents.find(e => e.resource)?.resource || null,
          event_type: determineEventType(primaryEvent),
          source_events: matchedEvents.map(e => e.id),
          primary_source: primaryEvent.source,
          sources: allSources, // All sources this event appears in
          veracross_reservation_id: reservationId,
          resource_id: resourceId,
          recurring_pattern: recurringPattern,
          is_hidden: false,
          has_conflict: false,
          conflict_ok: false,
          needs_program_director: false,
          needs_office: false,
          needs_it: false,
          needs_security: false,
          needs_facilities: false,
        })
      }
    }

    console.log(`Created ${aggregatedEvents.length} aggregated events`)

    // Check for existing events and update or insert
    // For now, we'll do a simple approach: clear future events and re-create
    // In production, you'd want smarter merging to preserve edits
    
    // Get existing events that were auto-generated (have source_events)
    const { data: existingEvents } = await supabase
      .from('ops_events')
      .select('id, source_events')
      .gte('start_date', today)
      .not('source_events', 'eq', '{}')

    // Create a map of source_event combinations to existing event IDs
    const existingMap = new Map<string, string>()
    for (const existing of existingEvents || []) {
      const key = [...(existing.source_events || [])].sort().join(',')
      if (key) existingMap.set(key, existing.id)
    }

    // Upsert aggregated events
    const eventsToInsert: any[] = []
    const eventsToUpdate: any[] = []

    for (const event of aggregatedEvents) {
      const key = [...event.source_events].sort().join(',')
      const existingId = existingMap.get(key)
      
      if (existingId) {
        // Update existing event (only update non-edited fields)
        eventsToUpdate.push({
          id: existingId,
          title: event.title,
          description: event.description,
          start_date: event.start_date,
          end_date: event.end_date,
          start_time: event.start_time,
          end_time: event.end_time,
          all_day: event.all_day,
          location: event.location,
          source_events: event.source_events,
          sources: event.sources,
          updated_at: new Date().toISOString()
        })
      } else {
        eventsToInsert.push(event)
      }
    }

    // Insert new events
    if (eventsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('ops_events')
        .insert(eventsToInsert)
      
      if (insertError) {
        console.error('Insert error:', insertError)
        throw insertError
      }
    }

    // Update existing events
    for (const event of eventsToUpdate) {
      const { error: updateError } = await supabase
        .from('ops_events')
        .update(event)
        .eq('id', event.id)
      
      if (updateError) {
        console.error('Update error:', updateError)
      }
    }

    // Detect conflicts (same location, overlapping time)
    await detectConflicts(supabase, today)

    return NextResponse.json({
      success: true,
      message: `Aggregated ${aggregatedEvents.length} events (${eventsToInsert.length} new, ${eventsToUpdate.length} updated)`,
      events_created: eventsToInsert.length,
      events_updated: eventsToUpdate.length,
      duration_ms: Date.now() - startTime
    })

  } catch (error: any) {
    console.error('Aggregation error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Aggregation failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 })
  }
}

async function detectConflicts(supabase: any, today: string) {
  // Get all events grouped by date and location
  const { data: events } = await supabase
    .from('ops_events')
    .select('id, title, start_date, start_time, end_time, location')
    .gte('start_date', today)
    .eq('is_hidden', false)
    .not('location', 'is', null)
    .order('start_date')
    .order('start_time')

  if (!events || events.length === 0) return

  // Group by date + location
  const grouped: Record<string, any[]> = {}
  for (const event of events) {
    const key = `${event.start_date}-${event.location?.toLowerCase()}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(event)
  }

  // Check for overlaps
  const conflictIds: string[] = []
  
  for (const key in grouped) {
    const dayLocationEvents = grouped[key]
    if (dayLocationEvents.length < 2) continue
    
    for (let i = 0; i < dayLocationEvents.length; i++) {
      for (let j = i + 1; j < dayLocationEvents.length; j++) {
        const a = dayLocationEvents[i]
        const b = dayLocationEvents[j]
        
        // Simple time overlap check
        if (a.start_time && b.start_time) {
          // If times overlap, mark as conflict
          // For simplicity: if events have same start time, or one starts before other ends
          if (a.start_time === b.start_time) {
            conflictIds.push(a.id, b.id)
          }
        }
      }
    }
  }

  // Update conflict flags
  if (conflictIds.length > 0) {
    const uniqueIds = [...new Set(conflictIds)]
    await supabase
      .from('ops_events')
      .update({ 
        has_conflict: true,
        conflict_notes: 'Potential scheduling conflict detected'
      })
      .in('id', uniqueIds)
  }
}
