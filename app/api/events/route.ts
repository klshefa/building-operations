import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross API config
const VERACROSS_API_BASE = 'https://api.veracross.com/shefa/v3'
const VERACROSS_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'
const RESERVATIONS_SCOPE = 'resource_reservations.reservations:list'

// Use service role to bypass RLS
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getReservationsToken(): Promise<string> {
  const response = await fetch(VERACROSS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.VERACROSS_CLIENT_ID!,
      client_secret: process.env.VERACROSS_CLIENT_SECRET!,
      scope: RESERVATIONS_SCOPE,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Failed to get reservations token: ${response.status}`)
  }
  
  const data = await response.json()
  return data.access_token
}

// Convert time to minutes for comparison
function timeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  const str = timeStr.toLowerCase().trim()
  
  // ISO format: "1900-01-01T08:10:00Z"
  const isoMatch = str.match(/t(\d{2}):(\d{2})/)
  if (isoMatch) {
    return parseInt(isoMatch[1]) * 60 + parseInt(isoMatch[2])
  }
  
  // 12-hour format: "9:00 am", "10:30 pm"
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)/)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1])
    const mins = parseInt(ampmMatch[2])
    const period = ampmMatch[3]
    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    return hours * 60 + mins
  }
  
  // 24-hour format: "14:30" or "14:30:00"
  const h24Match = str.match(/^(\d{1,2}):(\d{2})/)
  if (h24Match) {
    return parseInt(h24Match[1]) * 60 + parseInt(h24Match[2])
  }
  
  return null
}

// Format time for display (12-hour format)
function formatTimeDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return ''
  
  // If already has am/pm, return as-is
  if (/am|pm/i.test(timeStr)) return timeStr
  
  const mins = timeToMinutes(timeStr)
  if (mins === null) return timeStr
  
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h)
  return m === 0 ? `${hour}:00 ${ampm}` : `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const source = searchParams.get('source')
  const hideHidden = searchParams.get('hideHidden') === 'true'
  const includeVcReservations = searchParams.get('includeVcReservations') !== 'false' // default true
  
  const supabase = createAdminClient()
  
  // 1. Fetch ops_events
  let query = supabase
    .from('ops_events')
    .select('*')
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true })
  
  if (startDate) {
    query = query.gte('start_date', startDate)
  }
  if (endDate) {
    query = query.lte('start_date', endDate)
  }
  if (source) {
    query = query.eq('primary_source', source)
  }
  if (hideHidden) {
    query = query.eq('is_hidden', false)
  }
  
  const { data: opsEvents, error } = await query
  
  if (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If not including VC reservations or no date range, return ops_events only
  if (!includeVcReservations || !startDate) {
    return NextResponse.json({ data: opsEvents })
  }

  // 2. Fetch resources for location mapping
  const { data: resources } = await supabase
    .from('ops_resources')
    .select('id, description')
  
  const resourceMap = new Map<number, string>()
  for (const r of resources || []) {
    resourceMap.set(r.id, r.description)
  }

  // 3. Build deduplication sets from ops_events
  const veracrossIdsInOpsEvents = new Set<string>()
  const opsEventsByDateAndResource = new Map<string, { start: number; end: number }[]>()
  
  for (const evt of opsEvents || []) {
    if (evt.veracross_reservation_id) {
      veracrossIdsInOpsEvents.add(String(evt.veracross_reservation_id))
    }
    
    // Track time slots for overlap detection
    if (evt.resource_id && evt.start_time && evt.end_time) {
      const key = `${evt.start_date}-${evt.resource_id}`
      const startMins = timeToMinutes(evt.start_time)
      const endMins = timeToMinutes(evt.end_time)
      if (startMins !== null && endMins !== null) {
        if (!opsEventsByDateAndResource.has(key)) {
          opsEventsByDateAndResource.set(key, [])
        }
        opsEventsByDateAndResource.get(key)!.push({ start: startMins, end: endMins })
      }
    }
  }

  // 4. Fetch Veracross reservations for the date range
  const vcReservationEvents: any[] = []
  
  try {
    const token = await getReservationsToken()
    const effectiveEndDate = endDate || startDate
    
    const url = `${VERACROSS_API_BASE}/resource_reservations/reservations?on_or_after_start_date=${startDate}&on_or_before_start_date=${effectiveEndDate}`
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'X-Page-Size': '500',
      },
    })
    
    if (res.ok) {
      const data = await res.json()
      const reservations = data.data || data || []
      
      for (const vcRes of reservations) {
        const vcId = String(vcRes.resource_reservation_id || vcRes.id)
        
        // Skip if already in ops_events by ID
        if (veracrossIdsInOpsEvents.has(vcId)) {
          continue
        }
        
        // Skip if overlaps with existing ops_event (fallback dedup)
        const resourceId = vcRes.resource_id || vcRes.resource?.id
        const vcDate = vcRes.start_date
        if (resourceId && vcDate) {
          const key = `${vcDate}-${resourceId}`
          const slots = opsEventsByDateAndResource.get(key) || []
          const vcStartMins = timeToMinutes(vcRes.start_time)
          const vcEndMins = timeToMinutes(vcRes.end_time)
          
          if (vcStartMins !== null && vcEndMins !== null) {
            const hasOverlap = slots.some(slot => {
              const overlapStart = Math.max(slot.start, vcStartMins)
              const overlapEnd = Math.min(slot.end, vcEndMins)
              const overlapMins = Math.max(0, overlapEnd - overlapStart)
              const vcDuration = vcEndMins - vcStartMins
              const slotDuration = slot.end - slot.start
              const vcOverlapPct = vcDuration > 0 ? overlapMins / vcDuration : 0
              const slotOverlapPct = slotDuration > 0 ? overlapMins / slotDuration : 0
              return vcOverlapPct > 0.8 || slotOverlapPct > 0.8
            })
            
            if (hasOverlap) continue
          }
        }
        
        // Get resource name
        const resourceName = resourceId ? resourceMap.get(resourceId) : null
        const locationName = resourceName || vcRes.resource?.description || 'Unknown Location'
        
        // Create ops_event-like object for the reservation
        vcReservationEvents.push({
          id: `vc-res-${vcId}`,
          veracross_reservation_id: vcId,
          title: vcRes.notes || vcRes.description || vcRes.name || 'Veracross Reservation',
          description: vcRes.notes || null,
          start_date: vcRes.start_date,
          end_date: vcRes.end_date || vcRes.start_date,
          start_time: formatTimeDisplay(vcRes.start_time),
          end_time: formatTimeDisplay(vcRes.end_time),
          all_day: false,
          location: locationName,
          resource_id: resourceId || null,
          primary_source: 'bigquery_resource',
          sources: ['bigquery_resource'],
          is_hidden: false,
          status: 'confirmed',
          created_at: vcRes.update_date || new Date().toISOString(),
          updated_at: vcRes.update_date || new Date().toISOString(),
          _isVcReservation: true, // Flag to identify these in UI if needed
        })
      }
    }
  } catch (err) {
    console.error('Error fetching Veracross reservations:', err)
    // Continue with ops_events only if VC fetch fails
  }

  // 5. Merge and sort
  const allEvents = [...(opsEvents || []), ...vcReservationEvents]
  
  // Sort by date, then time
  allEvents.sort((a, b) => {
    if (a.start_date !== b.start_date) {
      return a.start_date.localeCompare(b.start_date)
    }
    const aTime = timeToMinutes(a.start_time) ?? 0
    const bTime = timeToMinutes(b.start_time) ?? 0
    return aTime - bTime
  })
  
  return NextResponse.json({ data: allEvents })
}
