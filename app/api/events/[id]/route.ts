import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { TeamType, OpsEvent } from '@/lib/types'
import { buildTeamAssignmentEmail, buildEventUpdateEmail, getTeamDisplayName } from '@/lib/notifications'
import { logAudit, getChangedFields, extractEventAuditFields } from '@/lib/audit'
import { parseVcResourceField } from '@/lib/utils/resourceMatching'

const RESEND_API_KEY = process.env.RESEND_API_KEY

// Veracross API config
const VERACROSS_API_BASE = 'https://api.veracross.com/shefa/v3'
const VERACROSS_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'
const RESERVATIONS_SCOPE = 'resource_reservations.reservations:list'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
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

// Format time for display
function formatTimeDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return ''
  if (/am|pm/i.test(timeStr)) return timeStr
  
  // Parse ISO or 24h time
  const isoMatch = timeStr.match(/T(\d{2}):(\d{2})/)
  const h24Match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  
  let hours: number, mins: number
  if (isoMatch) {
    hours = parseInt(isoMatch[1])
    mins = parseInt(isoMatch[2])
  } else if (h24Match) {
    hours = parseInt(h24Match[1])
    mins = parseInt(h24Match[2])
  } else {
    return timeStr
  }
  
  const ampm = hours >= 12 ? 'pm' : 'am'
  const hour = hours > 12 ? hours - 12 : (hours === 0 ? 12 : hours)
  return mins === 0 ? `${hour}:00 ${ampm}` : `${hour}:${String(mins).padStart(2, '0')} ${ampm}`
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured')
    return false
  }
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Building Operations <ops@shefaschool.org>',
      to,
      subject,
      html
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    console.error('Email send failed:', error)
    return false
  }
  
  console.log('Email sent to:', to.join(', '))
  return true
}

// Team field mapping
const TEAM_FIELDS: Record<string, TeamType> = {
  needs_program_director: 'program_director',
  needs_office: 'office',
  needs_it: 'it',
  needs_security: 'security',
  needs_facilities: 'facilities'
}

// Fields to track for change notifications
const TRACKED_FIELDS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  start_date: 'Date',
  end_date: 'End date',
  start_time: 'Start time',
  end_time: 'End time',
  location: 'Location',
  expected_attendees: 'Expected attendees',
  food_served: 'Food service',
  food_provider: 'Food provider',
  general_notes: 'General notes',
  setup_instructions: 'Setup instructions',
  security_personnel_needed: 'Security personnel',
  techs_needed: 'Techs needed',
  av_equipment: 'AV equipment',
  program_director_notes: 'Program Director notes',
  office_notes: 'Office notes',
  it_notes: 'IT notes',
  security_notes: 'Security notes',
  facilities_notes: 'Facilities notes'
}

// All allowed fields for update (whitelist)
const ALLOWED_UPDATE_FIELDS = new Set([
  'title', 'description', 'start_date', 'end_date', 'start_time', 'end_time',
  'all_day', 'location', 'resource_id', 'event_type',
  'expected_attendees', 'food_served', 'food_provider',
  'needs_program_director', 'needs_office', 'needs_it', 'needs_security', 'needs_facilities',
  'program_director_notes', 'office_notes', 'it_notes', 'security_notes', 'facilities_notes',
  'setup_instructions', 'security_personnel_needed', 'building_open', 'elevator_notes',
  'techs_needed', 'av_equipment', 'tech_notes',
  'general_notes', 'is_hidden', 'has_conflict', 'conflict_ok', 'conflict_notes'
])

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const supabase = createAdminClient()
    
    // Check if this is a Veracross reservation ID (not in database)
    if (id.startsWith('vc-res-')) {
      const vcId = id.replace('vc-res-', '')
      console.log(`[Event API] Looking for Veracross reservation: ${vcId}`)
      
      // First, check if this reservation has been synced to ops_events
      // Try multiple formats since the ID might be stored as string or number
      console.log(`[Event API] Checking ops_events for veracross_reservation_id: "${vcId}"`)
      
      const { data: syncedEvents, error: syncError } = await supabase
        .from('ops_events')
        .select('*')
        .or(`veracross_reservation_id.eq.${vcId},veracross_reservation_id.eq."${vcId}"`)
      
      console.log(`[Event API] ops_events query result:`, { 
        count: syncedEvents?.length || 0, 
        error: syncError?.message,
        firstMatch: syncedEvents?.[0]?.id 
      })
      
      if (syncedEvents && syncedEvents.length > 0) {
        console.log(`[Event API] Found synced ops_event for VC reservation ${vcId}`)
        return NextResponse.json({ data: syncedEvents[0] })
      }
      
      // Also check ops_raw_events (BigQuery sync destination)
      console.log(`[Event API] Checking ops_raw_events for reservation_id: "${vcId}"`)
      
      const { data: rawEvents, error: rawError } = await supabase
        .from('ops_raw_events')
        .select('*')
        .or(`reservation_id.eq.${vcId},reservation_id.eq."${vcId}"`)
      
      console.log(`[Event API] ops_raw_events query result:`, {
        count: rawEvents?.length || 0,
        error: rawError?.message,
        firstMatch: rawEvents?.[0]?.title
      })
      
      if (rawEvents && rawEvents.length > 0) {
        console.log(`[Event API] Found ${rawEvents.length} raw events for VC reservation ${vcId}`)
        // Convert raw event to ops_event format
        const raw = rawEvents[0]
        const data = {
          id: id,
          veracross_reservation_id: vcId,
          title: raw.title || 'Resource Reservation',
          description: raw.description || null,
          start_date: raw.start_date,
          end_date: raw.end_date || raw.start_date,
          start_time: raw.start_time,
          end_time: raw.end_time,
          all_day: false,
          location: raw.resource || null,
          resource_id: null,
          primary_source: 'bigquery_resource',
          sources: ['bigquery_resource'],
          is_hidden: false,
          status: 'confirmed',
          event_type: 'other',
          created_at: raw.synced_at || new Date().toISOString(),
          updated_at: raw.synced_at || new Date().toISOString(),
          needs_program_director: false,
          needs_office: false,
          needs_it: false,
          needs_security: false,
          needs_facilities: false,
          // From raw data
          contact_person: raw.contact_person,
          _isRawEvent: true,
          _vcReadOnly: true, // Still read-only since it's not in ops_events
        }
        return NextResponse.json({ data })
      }
      
      // Get optional date hint from query params
      const { searchParams } = new URL(request.url)
      const dateHint = searchParams.get('date')
      
      console.log(`[Event API] No synced event found by ID, trying Veracross API to get details for matching`)
      
      try {
        const token = await getReservationsToken()
        
        // Build date range for search - use hint or search recent 60 days
        let startDate: string
        let endDate: string
        
        if (dateHint) {
          // Search just that date
          startDate = dateHint
          endDate = dateHint
        } else {
          // Search recent 60 days
          const today = new Date()
          const pastDate = new Date(today)
          pastDate.setDate(pastDate.getDate() - 30)
          const futureDate = new Date(today)
          futureDate.setDate(futureDate.getDate() + 30)
          startDate = pastDate.toISOString().split('T')[0]
          endDate = futureDate.toISOString().split('T')[0]
        }
        
        const url = `${VERACROSS_API_BASE}/resource_reservations/reservations?on_or_after_start_date=${startDate}&on_or_before_start_date=${endDate}`
        console.log(`[Event API] Veracross URL: ${url}`)
        
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
            'X-Page-Size': '500',
          },
        })
        
        console.log(`[Event API] Veracross response status: ${res.status}`)
        
        if (!res.ok) {
          const errorText = await res.text()
          console.error(`[Event API] Veracross error: ${errorText}`)
          return NextResponse.json({ error: 'Veracross reservation not found' }, { status: 404 })
        }
        
        const vcData = await res.json()
        const reservations = vcData.data || vcData || []
        console.log(`[Event API] Found ${reservations.length} reservations, looking for ID ${vcId}`)
        
        // Find the specific reservation by ID
        const vcRes = reservations.find((r: any) => 
          String(r.resource_reservation_id) === vcId || String(r.id) === vcId
        )
        
        if (!vcRes) {
          console.log(`[Event API] Reservation ${vcId} not found in results`)
          return NextResponse.json({ error: 'Veracross reservation not found' }, { status: 404 })
        }
        
        console.log(`[Event API] Found reservation:`, JSON.stringify(vcRes).substring(0, 200))
        
        // Get resource name
        const vcParsed = parseVcResourceField(vcRes)
        const resourceId = vcParsed.id
        let locationName = vcParsed.name || 'Unknown Location'
        
        if (resourceId) {
          const { data: resource } = await supabase
            .from('ops_resources')
            .select('description')
            .eq('id', resourceId)
            .single()
          if (resource?.description) {
            locationName = resource.description
          }
        }
        
        // Try to find matching ops_event by title + date (for events created before ID tracking)
        const vcTitle = vcRes.notes || vcRes.description || vcRes.name || ''
        const vcDate = vcRes.start_date
        
        if (vcTitle && vcDate) {
          console.log(`[Event API] Trying to match by title="${vcTitle}" date="${vcDate}" resource=${resourceId} location="${locationName}"`)
          
          // Debug: List all ops_events on this date
          const { data: allEventsOnDate } = await supabase
            .from('ops_events')
            .select('id, title, location, start_time, end_time, veracross_reservation_id')
            .eq('start_date', vcDate)
          console.log(`[Event API] All ops_events on ${vcDate}:`, JSON.stringify(allEventsOnDate, null, 2))
          
          // First try: exact title match on date
          let { data: matchedEvents } = await supabase
            .from('ops_events')
            .select('*')
            .eq('start_date', vcDate)
            .ilike('title', vcTitle.trim())
          
          console.log(`[Event API] Exact title match found: ${matchedEvents?.length || 0}`)
          
          // Second try: partial title match (title contains the VC title)
          if (!matchedEvents || matchedEvents.length === 0) {
            const { data: partialMatches } = await supabase
              .from('ops_events')
              .select('*')
              .eq('start_date', vcDate)
              .ilike('title', `%${vcTitle.trim()}%`)
            
            matchedEvents = partialMatches
            console.log(`[Event API] Partial title match found: ${matchedEvents?.length || 0}`)
          }
          
          // Third try: match by location + date + approximate time
          if ((!matchedEvents || matchedEvents.length === 0) && locationName) {
            const { data: locationMatches } = await supabase
              .from('ops_events')
              .select('*')
              .eq('start_date', vcDate)
              .ilike('location', `%${locationName}%`)
            
            // Filter by time overlap
            if (locationMatches && locationMatches.length > 0) {
              const vcStartMins = timeToMinutes(vcRes.start_time)
              const vcEndMins = timeToMinutes(vcRes.end_time)
              
              matchedEvents = locationMatches.filter(evt => {
                const evtStartMins = timeToMinutes(evt.start_time)
                const evtEndMins = timeToMinutes(evt.end_time)
                if (evtStartMins === null || evtEndMins === null || vcStartMins === null || vcEndMins === null) return false
                // Check if times match within 5 minutes
                return Math.abs(evtStartMins - vcStartMins) <= 5 && Math.abs(evtEndMins - vcEndMins) <= 5
              })
              console.log(`[Event API] Location+time match found: ${matchedEvents?.length || 0}`)
            }
          }
          
          if (matchedEvents && matchedEvents.length > 0) {
            console.log(`[Event API] Found matching ops_event: ${matchedEvents[0].id} title="${matchedEvents[0].title}"`)
            
            // Update the ops_event with the veracross_reservation_id for future lookups
            const { error: updateError } = await supabase
              .from('ops_events')
              .update({ veracross_reservation_id: vcId })
              .eq('id', matchedEvents[0].id)
            
            if (!updateError) {
              console.log(`[Event API] Updated ops_event ${matchedEvents[0].id} with veracross_reservation_id=${vcId}`)
            }
            
            return NextResponse.json({ data: matchedEvents[0] })
          }
          
          console.log(`[Event API] No matching ops_event found for title="${vcTitle}" date="${vcDate}"`)
        }
        
        // Build ops_event-like object (read-only since no match found)
        const data = {
          id: id,
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
          event_type: 'other',
          created_at: vcRes.update_date || new Date().toISOString(),
          updated_at: vcRes.update_date || new Date().toISOString(),
          // Team assignments (none for VC reservations)
          needs_program_director: false,
          needs_office: false,
          needs_it: false,
          needs_security: false,
          needs_facilities: false,
          // Flag to indicate this is read-only
          _isVcReservation: true,
          _vcReadOnly: true,
        }
        
        return NextResponse.json({ data })
      } catch (vcError: any) {
        console.error('Error fetching Veracross reservation:', vcError)
        return NextResponse.json({ error: 'Failed to fetch Veracross reservation' }, { status: 500 })
      }
    }
    
    // Normal database lookup
    const { data, error } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const body = await request.json()
    console.log('PATCH request for event:', id)
    console.log('Body keys:', Object.keys(body))
    
    const supabase = createAdminClient()

    // Get current event data for comparison
    const { data: currentEvent, error: fetchError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Remove fields that shouldn't be updated directly and filter to allowed fields only
    const { id: _, created_at, source_events, primary_source, sources, ...rawUpdateData } = body

    // Only include allowed fields (whitelist approach)
    const updateData: Record<string, any> = {}
    for (const [key, value] of Object.entries(rawUpdateData)) {
      if (ALLOWED_UPDATE_FIELDS.has(key)) {
        updateData[key] = value
      }
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString()
    
    console.log('Filtered update data keys:', Object.keys(updateData))
    console.log('Update data:', JSON.stringify(updateData, null, 2))

    const { data, error } = await supabase
      .from('ops_events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    // Audit log
    const oldAuditValues = extractEventAuditFields(currentEvent)
    const newAuditValues = extractEventAuditFields(data)
    const auditChangedFields = getChangedFields(oldAuditValues, newAuditValues)
    
    if (auditChangedFields) {
      await logAudit({
        entityType: 'ops_events',
        entityId: id,
        action: 'UPDATE',
        userEmail: body.updated_by,
        changedFields: auditChangedFields,
        oldValues: oldAuditValues,
        newValues: newAuditValues,
        apiRoute: '/api/events/[id]',
        httpMethod: 'PATCH',
      })
    }

    // Check for newly assigned teams and send notifications
    const newlyAssignedTeams: TeamType[] = []
    for (const [field, team] of Object.entries(TEAM_FIELDS)) {
      if (updateData[field] === true && currentEvent[field] !== true) {
        newlyAssignedTeams.push(team)
      }
    }

    // Send team assignment notifications directly
    for (const team of newlyAssignedTeams) {
      const { data: teamMembers } = await supabase
        .from('ops_users')
        .select('email, name')
        .contains('teams', [team])
        .eq('is_active', true)
      
      if (teamMembers && teamMembers.length > 0) {
        const html = buildTeamAssignmentEmail(data as OpsEvent, team)
        const teamName = getTeamDisplayName(team)
        await sendEmail(
          teamMembers.map(m => m.email),
          `[Ops] ${teamName} Team Assigned: ${data.title}`,
          html
        )
      }
    }

    // Detect changes for subscriber notifications
    const changes: string[] = []
    for (const [field, label] of Object.entries(TRACKED_FIELDS)) {
      if (field in updateData && updateData[field] !== currentEvent[field]) {
        if (typeof updateData[field] === 'boolean') {
          changes.push(`${label} changed to ${updateData[field] ? 'Yes' : 'No'}`)
        } else if (updateData[field] === null || updateData[field] === '') {
          changes.push(`${label} was cleared`)
        } else {
          changes.push(`${label} was updated`)
        }
      }
    }

    // Also check team assignments for subscriber notifications
    for (const [field, team] of Object.entries(TEAM_FIELDS)) {
      if (field in updateData && updateData[field] !== currentEvent[field]) {
        const teamName = team.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
        changes.push(`${teamName} team ${updateData[field] ? 'assigned' : 'removed'}`)
      }
    }

    // Send update notifications to subscribers directly
    if (changes.length > 0) {
      const { data: subscribers } = await supabase
        .from('event_subscriptions')
        .select('user_email, user_name')
        .eq('event_id', id)
      
      if (subscribers && subscribers.length > 0) {
        console.log('Sending update notifications to:', subscribers.map(s => s.user_email))
        for (const sub of subscribers) {
          const html = buildEventUpdateEmail(data as OpsEvent, changes, sub.user_name || undefined)
          await sendEmail(
            [sub.user_email],
            `[Ops] Event Updated: ${data.title}`,
            html
          )
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Event updated successfully',
      data,
      notifications: {
        teamsNotified: newlyAssignedTeams,
        changesDetected: changes
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
