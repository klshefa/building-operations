import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross API config
const VERACROSS_API_BASE = 'https://api.veracross.com/shefa/v3'
const VERACROSS_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'
const CLASS_SCHEDULES_SCOPE = 'academics.class_schedules:list academics.classes:list'
const RESERVATIONS_SCOPE = 'resource_reservations.reservations:list'

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

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getClassSchedulesToken(): Promise<string> {
  const response = await fetch(VERACROSS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.VERACROSS_CLIENT_ID!,
      client_secret: process.env.VERACROSS_CLIENT_SECRET!,
      scope: CLASS_SCHEDULES_SCOPE,
    }),
  })
  
  if (!response.ok) {
    throw new Error(`Failed to get token: ${response.status}`)
  }
  
  const data = await response.json()
  return data.access_token
}

const dayNameToNumber: Record<string, number> = {
  'sunday': 0, 'sun': 0, 'su': 0, 'u': 0,
  'monday': 1, 'mon': 1, 'mo': 1, 'm': 1,
  'tuesday': 2, 'tue': 2, 'tu': 2, 't': 2,
  'wednesday': 3, 'wed': 3, 'we': 3, 'w': 3,
  'thursday': 4, 'thu': 4, 'th': 4, 'r': 4,
  'friday': 5, 'fri': 5, 'fr': 5, 'f': 5,
  'saturday': 6, 'sat': 6, 'sa': 6,
}

function patternIncludesDay(pattern: string, dayOfWeek: number): boolean {
  if (!pattern) return false
  const patternLower = pattern.toLowerCase().trim()
  
  const mappedDay = dayNameToNumber[patternLower]
  if (mappedDay !== undefined) {
    return mappedDay === dayOfWeek
  }
  
  const parts = patternLower.split(/[^a-z]+/).filter(Boolean)
  for (const part of parts) {
    const partDay = dayNameToNumber[part]
    if (partDay === dayOfWeek) return true
  }
  
  return false
}

function normalizeTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null
  const iso = timeStr.match(/T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) return timeStr
  return null
}

interface CalendarEvent {
  id: string
  title: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  type: 'reservation' | 'class' | 'calendar'
  source?: string
}

// GET /api/resources/[id]/calendar?date=2026-01-28
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const resourceId = parseInt(id)
    
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    
    if (!date) {
      return NextResponse.json({ error: 'date is required' }, { status: 400 })
    }
    
    if (isNaN(resourceId)) {
      return NextResponse.json({ error: 'Invalid resource ID' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    const events: CalendarEvent[] = []
    
    // Get resource info
    const { data: resource } = await supabase
      .from('ops_resources')
      .select('description, abbreviation')
      .eq('id', resourceId)
      .single()
    
    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }
    
    // 1. Get ops_events for this resource/date
    const { data: opsEvents, error: opsEventsError } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, location, status, resource_id')
      .eq('resource_id', resourceId)
      .eq('start_date', date)
      .eq('is_hidden', false)
    
    console.log(`[Calendar] Query: resource_id=${resourceId}, date=${date}`)
    console.log(`[Calendar] Found ${opsEvents?.length || 0} ops_events, error:`, opsEventsError)
    if (opsEvents?.length) {
      console.log('[Calendar] ops_events:', opsEvents.map(e => ({ id: e.id, title: e.title, resource_id: e.resource_id })))
    }
    
    for (const event of opsEvents || []) {
      // Show cancelled events greyed out
      const title = event.status === 'cancelled' ? `[CANCELLED] ${event.title}` : event.title
      events.push({
        id: event.id,
        title,
        startTime: event.start_time,
        endTime: event.end_time,
        allDay: event.all_day,
        type: 'reservation'
      })
    }
    
    // Also check events matching by location text
    const locationMatches: string[] = []
    if (resource?.description) locationMatches.push(resource.description)
    if (resource?.abbreviation) locationMatches.push(resource.abbreviation)
    
    const { data: locationEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, location, status')
      .eq('start_date', date)
      .eq('is_hidden', false)
      .is('resource_id', null)
    
    for (const event of locationEvents || []) {
      if (!event.location) continue
      const loc = event.location.toLowerCase()
      if (locationMatches.some(m => loc.includes(m.toLowerCase()) || m.toLowerCase().includes(loc))) {
        const title = event.status === 'cancelled' ? `[CANCELLED] ${event.title}` : event.title
        events.push({
          id: event.id,
          title,
          startTime: event.start_time,
          endTime: event.end_time,
          allDay: event.all_day,
          type: 'reservation'
        })
      }
    }
    
    // 2. Get Veracross reservations directly from API
    const existingEventIds = new Set(events.map(e => e.id))
    
    try {
      const reservationsToken = await getReservationsToken()
      // Fetch reservations for this resource on this date
      const url = `${VERACROSS_API_BASE}/resource_reservations/reservations?resource_id=${resourceId}&on_or_after_start_date=${date}&on_or_before_start_date=${date}`
      console.log(`[Calendar] Fetching Veracross reservations: ${url}`)
      
      const reservationsRes = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${reservationsToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '100',
        },
      })
      
      console.log(`[Calendar] Veracross reservations response status: ${reservationsRes.status}`)
      
      if (reservationsRes.ok) {
        const reservationsData = await reservationsRes.json()
        console.log(`[Calendar] Veracross raw response:`, JSON.stringify(reservationsData).substring(0, 500))
        
        const reservations = reservationsData.data || reservationsData || []
        console.log(`[Calendar] Found ${reservations.length} Veracross reservations for resource ${resourceId} on ${date}`)
        
        for (const res of reservations) {
          const resId = `vc-res-${res.resource_reservation_id || res.id}`
          
          // Skip if we already have this event
          if (existingEventIds.has(resId)) continue
          
          console.log(`[Calendar] Adding reservation: ${res.notes || res.description || 'Reservation'} at ${res.start_time}-${res.end_time}`)
          
          events.push({
            id: resId,
            title: res.notes || res.description || res.name || 'Reservation',
            startTime: normalizeTime(res.start_time),
            endTime: normalizeTime(res.end_time),
            allDay: false,
            type: 'reservation',
            source: 'veracross'
          })
          existingEventIds.add(resId)
        }
      } else {
        const errorText = await reservationsRes.text()
        console.log(`[Calendar] Veracross API error: ${reservationsRes.status} - ${errorText}`)
      }
    } catch (err) {
      console.error('[Calendar] Error fetching Veracross reservations:', err)
    }
    
    // 3. Get class schedules for this resource
    let classDebug: any = { step: 'start' }
    try {
      const accessToken = await getClassSchedulesToken()
      classDebug.step = 'got token'
      const dateObj = new Date(date + 'T12:00:00')
      const dayOfWeek = dateObj.getDay()
      classDebug.dayOfWeek = dayOfWeek
      
      // Fetch class names and status - only include active/future classes
      const classNamesMap: Record<string, string> = {}
      const activeClassIds = new Set<string>()
      const classesRes = await fetch(`${VERACROSS_API_BASE}/academics/classes`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '1000',
        },
      })
      
      if (classesRes.ok) {
        const classesData = await classesRes.json()
        const classes = classesData.data || classesData || []
        for (const cls of classes) {
          // Status is an integer: skip if explicitly inactive (0)
          if (cls.status === 0) continue
          
          const name = cls.name || cls.description || cls.course_name || ''
          // Use internal class ID (cls.id) - matches schedule.internal_class_id
          if (cls.id != null) {
            const internalId = String(cls.id)
            classNamesMap[internalId] = name
            activeClassIds.add(internalId)
          }
        }
      }
      
      classDebug.activeClassIdsCount = activeClassIds.size
      
      // Fetch schedules
      const scheduleRes = await fetch(`${VERACROSS_API_BASE}/academics/class_schedules`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '1000',
        },
      })
      
      classDebug.step = 'fetching schedules'
      classDebug.scheduleStatus = scheduleRes.status
      if (!scheduleRes.ok) {
        const errorText = await scheduleRes.text()
        classDebug.scheduleError = errorText.substring(0, 200)
      }
      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json()
        const schedules = scheduleData.data || scheduleData || []
        classDebug.totalSchedules = schedules.length
        
        const targetRoomDesc = resource.description?.toLowerCase().trim() || ''
        const targetRoomNumber = (resource.description || '').match(/^\d+/)?.[0] || ''
        classDebug.roomInfo = { targetRoomDesc, targetRoomNumber }
        
        const seenKeys = new Set<string>()
        let roomMatches = 0, dayMatches = 0, activeMatches = 0
        
        for (const schedule of schedules) {
          // Get the schedule's room
          const scheduleRoom = schedule.room?.description || ''
          const scheduleRoomLower = scheduleRoom.toLowerCase().trim()
          const scheduleRoomNumber = scheduleRoom.match(/^\d+/)?.[0] || ''
          
          // SKIP if schedule has no room assigned
          if (!scheduleRoomLower || scheduleRoomLower === '<none specified>' || scheduleRoomLower === 'none') {
            continue
          }
          
          // CHECK: Does this schedule's room match our target room?
          let roomMatched = false
          
          // For numbered rooms (313, 404): match by room number
          if (targetRoomNumber && scheduleRoomNumber) {
            // Exact number match OR starts with number (313 matches 313A, 313B)
            if (scheduleRoomNumber === targetRoomNumber) {
              roomMatched = true
            }
          }
          
          // For named rooms (Ulam, Playroof): exact match or prefix match
          if (!roomMatched && targetRoomDesc && scheduleRoomLower) {
            if (scheduleRoomLower === targetRoomDesc) {
              roomMatched = true
            } else if (scheduleRoomLower.startsWith(targetRoomDesc + ' ')) {
              roomMatched = true
            }
          }
          
          // SKIP if room doesn't match
          if (!roomMatched) {
            continue
          }
          roomMatches++
          
          // Check day pattern
          const dayPattern = schedule.day?.description || schedule.day?.abbreviation || ''
          if (!patternIncludesDay(dayPattern, dayOfWeek)) continue
          dayMatches++
          
          // Dedupe
          const key = `${schedule.internal_class_id || schedule.class_id}-${scheduleRoomLower}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          
          // Use internal_class_id - matches cls.id from /academics/classes
          const internalId = schedule.internal_class_id != null ? String(schedule.internal_class_id) : ''
          
          // Check if this class is active using internal_class_id
          if (!internalId || !activeClassIds.has(internalId)) continue
          activeMatches++
          
          // Get class name using the internal ID
          const className = classNamesMap[internalId] || schedule.block?.description || 'Class'
          
          // Debug: capture matched rooms
          if (!classDebug.matchedRooms) classDebug.matchedRooms = []
          if (classDebug.matchedRooms.length < 5) {
            classDebug.matchedRooms.push({
              className,
              scheduleRoom: scheduleRoomLower,
              scheduleRoomNumber
            })
          }
          
          events.push({
            id: `class-${schedule.id}`,
            title: className,
            startTime: normalizeTime(schedule.start_time),
            endTime: normalizeTime(schedule.end_time),
            allDay: false,
            type: 'class'
          })
        }
        classDebug.matches = { roomMatches, dayMatches, activeMatches }
      }
    } catch (err: any) {
      console.error('Class schedule fetch failed:', err?.message || err)
      classDebug.error = err?.message || String(err)
    }
    
    // 3. Get school-wide calendar events
    const { data: calendarEvents } = await supabase
      .from('ops_raw_events')
      .select('id, title, source, start_date, end_date')
      .in('source', ['calendar_staff', 'calendar_ls', 'calendar_ms'])
      .lte('start_date', date)
      .gte('end_date', date)
    
    for (const cal of calendarEvents || []) {
      events.push({
        id: `cal-${cal.id}`,
        title: cal.title,
        startTime: null,
        endTime: null,
        allDay: true,
        type: 'calendar',
        source: cal.source
      })
    }
    
    // Convert time string to minutes for sorting
    const timeToMinutes = (time: string | null): number => {
      if (!time) return 9999
      // Handle 24-hour format "HH:MM"
      const match24 = time.match(/^(\d{1,2}):(\d{2})$/)
      if (match24) {
        return parseInt(match24[1]) * 60 + parseInt(match24[2])
      }
      // Handle 12-hour format "H:MM am/pm"
      const match12 = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
      if (match12) {
        let hours = parseInt(match12[1])
        const mins = parseInt(match12[2])
        const isPM = match12[3].toLowerCase() === 'pm'
        if (isPM && hours !== 12) hours += 12
        if (!isPM && hours === 12) hours = 0
        return hours * 60 + mins
      }
      return 9999
    }
    
    // Sort by time (all-day first, then by start time)
    events.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1
      if (!a.allDay && b.allDay) return 1
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    })
    
    return NextResponse.json({
      resource: {
        id: resourceId,
        description: resource.description,
        abbreviation: resource.abbreviation
      },
      date,
      events,
      classDebug
    })
    
  } catch (error: any) {
    console.error('Resource calendar error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
