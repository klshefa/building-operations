import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET - Fetch rooms with their events for a date range
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const resourceType = searchParams.get('resourceType')
    
    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    // Get all resources
    let resourceQuery = supabase
      .from('ops_resources')
      .select('*')
      .order('description')
    
    if (resourceType) {
      resourceQuery = resourceQuery.eq('resource_type', resourceType)
    }
    
    const { data: resources, error: resourceError } = await resourceQuery
    
    if (resourceError) {
      return NextResponse.json({ error: resourceError.message }, { status: 500 })
    }
    
    // Get events in date range (with resource_id OR location)
    const { data: events, error: eventError } = await supabase
      .from('ops_events')
      .select('id, title, start_date, end_date, start_time, end_time, all_day, location, resource_id, is_hidden, has_conflict')
      .gte('start_date', startDate)
      .lte('start_date', endDate)
      .eq('is_hidden', false)
      .order('start_date')
      .order('start_time')
    
    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 })
    }
    
    // Build lookup maps for matching location text to resources
    const resourceByDescription: Record<string, number> = {}
    const resourceByAbbreviation: Record<string, number> = {}
    for (const r of resources || []) {
      if (r.description) {
        resourceByDescription[r.description.toLowerCase()] = r.id
      }
      if (r.abbreviation) {
        resourceByAbbreviation[r.abbreviation.toLowerCase()] = r.id
      }
    }
    
    // Group events by resource (match by resource_id OR location text)
    const eventsByResource: Record<number, typeof events> = {}
    for (const event of events || []) {
      let resourceId = event.resource_id
      
      // If no resource_id, try to match by location text
      if (!resourceId && event.location) {
        const locLower = event.location.toLowerCase().trim()
        
        // Try exact match on description
        if (resourceByDescription[locLower]) {
          resourceId = resourceByDescription[locLower]
        }
        // Try exact match on abbreviation
        else if (resourceByAbbreviation[locLower]) {
          resourceId = resourceByAbbreviation[locLower]
        }
        // Try partial match - location contains abbreviation
        else {
          for (const [abbr, id] of Object.entries(resourceByAbbreviation)) {
            if (locLower.includes(abbr) || abbr.includes(locLower)) {
              resourceId = id
              break
            }
          }
        }
        // Try partial match - location contains description
        if (!resourceId) {
          for (const [desc, id] of Object.entries(resourceByDescription)) {
            if (locLower.includes(desc) || desc.includes(locLower)) {
              resourceId = id
              break
            }
          }
        }
      }
      
      if (resourceId) {
        if (!eventsByResource[resourceId]) {
          eventsByResource[resourceId] = []
        }
        eventsByResource[resourceId].push(event)
      }
    }
    
    // Calculate utilization stats for each resource
    const roomsWithStats = (resources || []).map(resource => {
      const resourceEvents = eventsByResource[resource.id] || []
      const totalEvents = resourceEvents.length
      
      // Calculate total hours booked
      let totalHours = 0
      for (const event of resourceEvents) {
        if (event.all_day) {
          totalHours += 8 // Assume 8 hours for all-day events
        } else if (event.start_time && event.end_time) {
          const start = parseTime(event.start_time)
          const end = parseTime(event.end_time)
          if (start !== null && end !== null) {
            totalHours += (end - start) / 60
          }
        }
      }
      
      return {
        ...resource,
        events: resourceEvents,
        totalEvents,
        totalHours: Math.round(totalHours * 10) / 10,
      }
    })
    
    // Get unique resource types for filtering
    const resourceTypes = [...new Set((resources || []).map(r => r.resource_type).filter(Boolean))]
    
    return NextResponse.json({
      rooms: roomsWithStats,
      resourceTypes,
      dateRange: { startDate, endDate },
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function parseTime(timeStr: string): number | null {
  if (!timeStr) return null
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2])
  }
  return null
}
