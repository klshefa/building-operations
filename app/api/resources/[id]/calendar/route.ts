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
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/)
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`
  return null
}

function normalizeResourceName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/^\d+\s+/, '') // drop leading room numbers
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ')
}

function resourceNamesMatch(localName: string, vcName: string): boolean {
  const a = normalizeResourceName(localName)
  const b = normalizeResourceName(vcName)
  if (!a || !b) return false
  if (a === b) return true
  // Handle grouped names like "ulam" vs "ulam 1"
  return a.startsWith(b + ' ') || b.startsWith(a + ' ')
}

// Convert any time format to minutes for comparison
function convertTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  const str = timeStr.toLowerCase().trim()
  
  // ISO format: "1900-01-01T08:10:00Z" or "T08:10"
  const isoMatch = str.match(/t(\d{2}):(\d{2})/)
  if (isoMatch) {
    return parseInt(isoMatch[1]) * 60 + parseInt(isoMatch[2])
  }
  
  // 12-hour format: "9:00 am", "10:30 pm"
  const ampmMatch = str.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/)
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1])
    const mins = parseInt(ampmMatch[2])
    const ampm = ampmMatch[3]
    if (ampm === 'pm' && hours < 12) hours += 12
    if (ampm === 'am' && hours === 12) hours = 0
    return hours * 60 + mins
  }
  
  // 24-hour format: "09:00", "14:30"
  const h24Match = str.match(/^(\d{1,2}):(\d{2})/)
  if (h24Match) {
    return parseInt(h24Match[1]) * 60 + parseInt(h24Match[2])
  }
  
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
      .select('id, title, start_time, end_time, all_day, location, status, resource_id, veracross_reservation_id, primary_source, sources')
      .eq('resource_id', resourceId)
      .eq('start_date', date)
      .eq('is_hidden', false)
    
    // Track veracross IDs we already have from ops_events to avoid duplicates
    const veracrossIdsInOpsEvents = new Set<string>()
    // Also track time slots from ops_events for fallback deduplication (as minutes)
    const opsEventTimeSlots: Array<{start: number, end: number}> = []
    
    // Dedup ops_events by veracross_reservation_id (manual + VC can both exist).
    const opsByVcId = new Map<string, any[]>()
    const opsWithoutVc: any[] = []
    for (const e of opsEvents || []) {
      const vcid = e.veracross_reservation_id ? String(e.veracross_reservation_id) : null
      if (vcid) {
        if (!opsByVcId.has(vcid)) opsByVcId.set(vcid, [])
        opsByVcId.get(vcid)!.push(e)
      } else {
        opsWithoutVc.push(e)
      }
    }

    const mergedOpsEvents: any[] = []
    for (const [, group] of opsByVcId) {
      if (group.length === 1) {
        mergedOpsEvents.push(group[0])
        continue
      }
      // Prefer the VC reservation record (keeps it labeled as VC Resource).
      const vc = group.find(g => g.primary_source === 'bigquery_resource') ?? group[0]
      const manual = group.find(g => g.primary_source === 'manual')
      if (!manual) {
        mergedOpsEvents.push(vc)
        continue
      }
      // Merge minimal display fields from manual into VC record.
      mergedOpsEvents.push({
        ...vc,
        title: manual.title || vc.title,
        start_time: manual.start_time || vc.start_time,
        end_time: manual.end_time || vc.end_time,
      })
    }
    mergedOpsEvents.push(...opsWithoutVc)

    for (const event of mergedOpsEvents) {
      if (event.veracross_reservation_id) {
        veracrossIdsInOpsEvents.add(String(event.veracross_reservation_id))
      }
      // Track time slots for fallback dedup (convert to minutes)
      const startMins = convertTimeToMinutes(event.start_time)
      const endMins = convertTimeToMinutes(event.end_time)
      console.log(`[Calendar] ops_event "${event.title}" times: start_time="${event.start_time}" (${startMins}min), end_time="${event.end_time}" (${endMins}min)`)
      if (startMins !== null && endMins !== null) {
        opsEventTimeSlots.push({ start: startMins, end: endMins })
      }
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
      .select('id, title, start_time, end_time, all_day, location, status, veracross_reservation_id')
      .eq('start_date', date)
      .eq('is_hidden', false)
      .is('resource_id', null)
    
    for (const event of locationEvents || []) {
      if (!event.location) continue
      const loc = event.location.toLowerCase()
      if (locationMatches.some(m => loc.includes(m.toLowerCase()) || m.toLowerCase().includes(loc))) {
        if (event.veracross_reservation_id) {
          veracrossIdsInOpsEvents.add(String(event.veracross_reservation_id))
        }
        // Also track time slots for fallback dedup
        const startMins = convertTimeToMinutes(event.start_time)
        const endMins = convertTimeToMinutes(event.end_time)
        console.log(`[Calendar] locationEvent "${event.title}" times: start_time="${event.start_time}" (${startMins}min), end_time="${event.end_time}" (${endMins}min)`)
        if (startMins !== null && endMins !== null) {
          opsEventTimeSlots.push({ start: startMins, end: endMins })
        }
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
    
    console.log(`[Calendar] Final opsEventTimeSlots:`, JSON.stringify(opsEventTimeSlots))
    
    // 2. Get Veracross reservations directly from API
    // IMPORTANT: We query by DATE only (not resource_id) because our local resource IDs 
    // don't match Veracross's IDs. We filter by resource name locally.
    const existingEventIds = new Set(events.map(e => e.id))
    const resourceName = resource.description?.trim() || ''
    const resourceAbbrev = resource.abbreviation?.trim() || ''
    
    try {
      const reservationsToken = await getReservationsToken()
      // Fetch ALL reservations for this date (no resource_id filter - IDs don't match between systems)
      const url = `${VERACROSS_API_BASE}/resource_reservations/reservations?on_or_after_start_date=${date}&on_or_before_start_date=${date}`
      console.log(`[Calendar] Fetching Veracross reservations: ${url}`)
      console.log(`[Calendar] Filtering for resource: "${resourceName}" / "${resourceAbbrev}"`)
      
      const reservationsRes = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${reservationsToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '200',
        },
      })
      
      console.log(`[Calendar] Veracross reservations response status: ${reservationsRes.status}`)
      
      if (reservationsRes.ok) {
        const reservationsData = await reservationsRes.json()
        console.log(`[Calendar] Veracross raw response:`, JSON.stringify(reservationsData).substring(0, 500))
        
        const reservations = reservationsData.data || reservationsData || []
        console.log(`[Calendar] Found ${reservations.length} total Veracross reservations on ${date}`)
        
        console.log(`[Calendar] veracrossIdsInOpsEvents:`, Array.from(veracrossIdsInOpsEvents))
        
        let matchedCount = 0
        console.log(`[Calendar] Looking for resource: "${resourceName}"`)
        
        for (const res of reservations) {
          const vcResId = String(res.resource_reservation_id || res.id)
          const resResourceName = (res.resource || res.resource?.description || '').toString()
          const resResourceId = res.resource_id || res.resource?.id
          const resResourceNameLower = resResourceName.toLowerCase()
          
          // Log to see what Veracross returns
          if (matchedCount < 3 || resResourceNameLower.includes('midrash') || resResourceNameLower.includes('beit')) {
            console.log(`[Calendar] Checking: resource="${res.resource}", title="${res.notes || res.description || 'Reservation'}"`)
          }
          
          // Prefer matching by resource_id when Veracross provides it.
          // Fallback to name matching only if ID matching isn't possible.
          const idMatch = resResourceId != null && String(resResourceId) === String(resourceId)
          const nameMatch =
            !idMatch &&
            (resourceNamesMatch(resourceName, resResourceName) ||
              (resourceAbbrev ? resourceNamesMatch(resourceAbbrev, resResourceName) : false))

          if (!idMatch && !nameMatch) continue
          
          console.log(`[Calendar] MATCHED: id=${vcResId}, title="${res.notes || res.description || 'Reservation'}", resource="${res.resource}"`)
          matchedCount++
          
          // Skip if we already have this from ops_events (avoid duplicates)
          if (veracrossIdsInOpsEvents.has(vcResId)) {
            console.log(`[Calendar] Skipping Veracross reservation ${vcResId} - already in ops_events by ID`)
            continue
          }
          
          // Fallback: skip if we have an ops_event that overlaps (for events created before ID tracking)
          const vcStartMins = convertTimeToMinutes(res.start_time)
          const vcEndMins = convertTimeToMinutes(res.end_time)
          console.log(`[Calendar] Veracross res times: start_time="${res.start_time}" (${vcStartMins}min), end_time="${res.end_time}" (${vcEndMins}min)`)
          console.log(`[Calendar] opsEventTimeSlots:`, JSON.stringify(opsEventTimeSlots))
          
          if (vcStartMins !== null && vcEndMins !== null) {
            // Check for significant overlap (>80% of either event's duration)
            const hasOverlap = opsEventTimeSlots.some(slot => {
              // Calculate overlap
              const overlapStart = Math.max(slot.start, vcStartMins)
              const overlapEnd = Math.min(slot.end, vcEndMins)
              const overlapMins = Math.max(0, overlapEnd - overlapStart)
              
              const vcDuration = vcEndMins - vcStartMins
              const slotDuration = slot.end - slot.start
              
              // Skip if >80% overlap with either event
              const vcOverlapPct = vcDuration > 0 ? overlapMins / vcDuration : 0
              const slotOverlapPct = slotDuration > 0 ? overlapMins / slotDuration : 0
              
              const isDupe = vcOverlapPct > 0.8 || slotOverlapPct > 0.8
              console.log(`[Calendar] Overlap check: VC(${vcStartMins}-${vcEndMins}) vs OPS(${slot.start}-${slot.end}) | overlap=${overlapMins}min vcPct=${(vcOverlapPct*100).toFixed(0)}% slotPct=${(slotOverlapPct*100).toFixed(0)}% isDupe=${isDupe}`)
              return isDupe
            })
            
            if (hasOverlap) {
              console.log(`[Calendar] Skipping Veracross reservation ${vcResId} - overlaps with ops_events`)
              continue
            }
          }
          
          const resId = `vc-res-${vcResId}`
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
        console.log(`[Calendar] Matched ${matchedCount} reservations for this resource`)
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
    
    // Sort by time (all-day first, then by start time)
    events.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1
      if (!a.allDay && b.allDay) return 1
      const aMin = convertTimeToMinutes(a.startTime) ?? 9999
      const bMin = convertTimeToMinutes(b.startTime) ?? 9999
      return aMin - bMin
    })
    
    return NextResponse.json({
      resource: {
        id: resourceId,
        description: resource.description,
        abbreviation: resource.abbreviation
      },
      date,
      events,
      classDebug,
      dedupDebug: {
        opsEventTimeSlots,
        veracrossIdsInOpsEvents: Array.from(veracrossIdsInOpsEvents),
        opsEventsCount: opsEvents?.length ?? 0,
        locationEventsCount: locationEvents?.length ?? 0,
        opsEventsRaw: (opsEvents || []).map(e => ({ 
          id: e.id, 
          title: e.title, 
          start_time: e.start_time, 
          end_time: e.end_time,
          start_mins: convertTimeToMinutes(e.start_time),
          end_mins: convertTimeToMinutes(e.end_time),
          resource_id: e.resource_id,
          veracross_reservation_id: e.veracross_reservation_id
        })),
        locationEventsMatched: (locationEvents || []).filter(e => {
          if (!e.location) return false
          const loc = e.location.toLowerCase()
          return locationMatches.some(m => loc.includes(m.toLowerCase()) || m.toLowerCase().includes(loc))
        }).map(e => ({
          id: e.id,
          title: e.title,
          start_time: e.start_time,
          end_time: e.end_time,
          location: e.location
        }))
      }
    })
    
  } catch (error: any) {
    console.error('Resource calendar error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
