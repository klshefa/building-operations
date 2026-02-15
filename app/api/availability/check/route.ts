import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross API config
const VERACROSS_API_BASE = 'https://api.veracross.com/shefa/v3'
const VERACROSS_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'
const CLASS_SCHEDULES_SCOPE = 'academics.class_schedules:list academics.classes:list'
const RESERVATIONS_SCOPE = 'resource_reservations.reservations:list'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get a token for class schedules
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

// Get a token for reservations
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

// Map day names to day of week numbers
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

function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (match) {
    return parseInt(match[1]) * 60 + parseInt(match[2])
  }
  return null
}

function normalizeTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null
  const iso = timeStr.match(/T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) return timeStr
  return null
}

function formatTimeDisplay(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const ampm = h >= 12 ? 'pm' : 'am'
  const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h)
  return m === 0 ? `${hour}${ampm}` : `${hour}:${String(m).padStart(2, '0')}${ampm}`
}

interface Conflict {
  type: 'conflict' | 'warning'
  title: string
  startTime: string
  endTime: string
  message: string
}

interface AvailabilityResult {
  available: boolean
  conflicts: Conflict[]
  warnings: Conflict[]
}

// Check if two time ranges overlap
function timesOverlap(
  start1: number, end1: number,
  start2: number, end2: number
): boolean {
  return start1 < end2 && end1 > start2
}

// Check if times are close (within threshold minutes)
function timesClose(
  end1: number, start2: number,
  threshold: number = 15
): boolean {
  return Math.abs(start2 - end1) <= threshold && Math.abs(start2 - end1) > 0
}

// GET /api/availability/check?resourceId=123&date=2026-01-28&startTime=09:00&endTime=10:00
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const resourceId = searchParams.get('resourceId')
    const date = searchParams.get('date')
    const startTime = searchParams.get('startTime')
    const endTime = searchParams.get('endTime')
    
    if (!resourceId || !date || !startTime || !endTime) {
      return NextResponse.json({ 
        error: 'resourceId, date, startTime, and endTime are required' 
      }, { status: 400 })
    }
    
    const requestStart = parseTimeToMinutes(startTime)
    const requestEnd = parseTimeToMinutes(endTime)
    
    if (requestStart === null || requestEnd === null) {
      return NextResponse.json({ 
        error: 'Invalid time format. Use HH:MM' 
      }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    const conflicts: Conflict[] = []
    const warnings: Conflict[] = []
    
    // 1. Check ops_events for conflicts on same resource/date
    const { data: events, error: eventError } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, status, location')
      .eq('resource_id', parseInt(resourceId))
      .eq('start_date', date)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')
    
    if (eventError) {
      console.error('Event query error:', eventError)
    }
    
    // Also get events that match by location text
    const { data: resource } = await supabase
      .from('ops_resources')
      .select('description, abbreviation')
      .eq('id', parseInt(resourceId))
      .single()
    
    const locationMatches: string[] = []
    if (resource?.description) locationMatches.push(resource.description)
    if (resource?.abbreviation) locationMatches.push(resource.abbreviation)
    
    const { data: locationEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, location, status')
      .eq('start_date', date)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')
      .is('resource_id', null)
    
    // Combine and check for overlaps
    const allEvents = [...(events || [])]
    
    console.log('[Availability] ops_events by resource_id:', events?.length || 0)
    console.log('[Availability] locationMatches for fuzzy:', locationMatches)
    
    for (const event of locationEvents || []) {
      if (!event.location) continue
      const loc = event.location.toLowerCase()
      const matchFound = locationMatches.some(m => loc.includes(m.toLowerCase()) || m.toLowerCase().includes(loc))
      if (matchFound) {
        console.log('[Availability] FUZZY MATCH ops_event:', {
          title: event.title,
          location: event.location,
          locationMatches
        })
        allEvents.push(event)
      }
    }
    
    console.log('[Availability] Total ops_events to check:', allEvents.length)
    
    for (const event of allEvents) {
      if (event.all_day) {
        conflicts.push({
          type: 'conflict',
          title: event.title,
          startTime: 'All day',
          endTime: '',
          message: `❌ Conflict: ${event.title} (All day event)`
        })
        continue
      }
      
      const eventStart = parseTimeToMinutes(event.start_time)
      const eventEnd = parseTimeToMinutes(event.end_time)
      
      if (eventStart === null || eventEnd === null) continue
      
      if (timesOverlap(requestStart, requestEnd, eventStart, eventEnd)) {
        console.log('[Availability] ADDING CONFLICT from ops_event:', {
          id: event.id,
          title: event.title,
          location: event.location,
          start_time: event.start_time,
          end_time: event.end_time
        })
        conflicts.push({
          type: 'conflict',
          title: event.title,
          startTime: event.start_time || '',
          endTime: event.end_time || '',
          message: `❌ Conflict: ${event.title} (${formatTimeDisplay(eventStart)}-${formatTimeDisplay(eventEnd)})`
        })
      } else {
        // Check for close events (warnings)
        if (timesClose(eventEnd, requestStart)) {
          warnings.push({
            type: 'warning',
            title: event.title,
            startTime: event.start_time || '',
            endTime: event.end_time || '',
            message: `⚠️ Note: ${event.title} ends ${requestStart - eventEnd} min before`
          })
        }
        if (timesClose(requestEnd, eventStart)) {
          warnings.push({
            type: 'warning',
            title: event.title,
            startTime: event.start_time || '',
            endTime: event.end_time || '',
            message: `⚠️ Note: ${event.title} starts ${eventStart - requestEnd} min after`
          })
        }
      }
    }
    
    // 1.5 Check Veracross reservations directly from API
    const checkedReservationIds = new Set<string>()
    let veracrossReservationsDebug: any = { status: 'not_started' }
    
    try {
      const reservationsToken = await getReservationsToken()
      veracrossReservationsDebug.tokenObtained = true
      
      // Simple: fetch reservations for THIS resource on THIS date
      const url = `${VERACROSS_API_BASE}/resource_reservations/reservations?resource_id=${resourceId}&start_date=${date}&end_date=${date}`
      veracrossReservationsDebug.url = url
      
      const reservationsRes = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${reservationsToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '100',
        },
      })
      
      veracrossReservationsDebug.httpStatus = reservationsRes.status
      
      if (reservationsRes.ok) {
        const reservationsData = await reservationsRes.json()
        const reservations = reservationsData.data || reservationsData || []
        
        veracrossReservationsDebug.status = 'success'
        veracrossReservationsDebug.count = reservations.length
        veracrossReservationsDebug.rawSample = reservations.length > 0 ? reservations[0] : null
        
        for (const res of reservations) {
          const resId = res.resource_reservation_id || res.id
          if (checkedReservationIds.has(String(resId))) continue
          checkedReservationIds.add(String(resId))
          
          const resStart = parseTimeToMinutes(res.start_time)
          const resEnd = parseTimeToMinutes(res.end_time)
          
          if (resStart === null || resEnd === null) continue
          
          if (timesOverlap(requestStart, requestEnd, resStart, resEnd)) {
            const resTitle = res.notes || res.description || res.name || 'Veracross Reservation'
            conflicts.push({
              type: 'conflict',
              title: resTitle,
              startTime: res.start_time || '',
              endTime: res.end_time || '',
              message: `❌ Conflict: ${resTitle} (${formatTimeDisplay(resStart)}-${formatTimeDisplay(resEnd)})`
            })
          }
        }
      } else {
        const errorText = await reservationsRes.text()
        veracrossReservationsDebug.status = 'api_error'
        veracrossReservationsDebug.error = errorText.substring(0, 200)
      }
    } catch (err: any) {
      veracrossReservationsDebug.status = 'exception'
      veracrossReservationsDebug.error = err?.message || String(err)
    }
    
    // 2. Check Veracross class schedules
    try {
      const accessToken = await getClassSchedulesToken()
      const dateObj = new Date(date + 'T12:00:00')
      const dayOfWeek = dateObj.getDay()
      
      // Fetch class names and status - only include active/future classes
      const classNamesMap: Record<string, string> = {}
      const activeClassIds = new Set<string>()
      let sampleClass: any = null
      let sampleSchedule: any = null
      let classPage = 1
      while (classPage <= 5) {
        const classesRes = await fetch(`${VERACROSS_API_BASE}/academics/classes`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'X-Page-Size': '1000',
            'X-Page-Number': String(classPage),
          },
        })
        if (!classesRes.ok) break
        const classesData = await classesRes.json()
        const classes = classesData.data || classesData || []
        
        // Capture sample class for debug
        if (classPage === 1 && classes.length > 0) {
          sampleClass = {
            id: classes[0].id,
            class_id: classes[0].class_id,
            internal_class_id: classes[0].internal_class_id,
            status: classes[0].status,
            name: classes[0].name
          }
        }
        
        for (const cls of classes) {
          // Status is an integer: typically 1=active, check for active status values
          // Include classes where status is 1 (active) or missing/null
          const statusNum = cls.status
          // Skip if status is explicitly set to an inactive value (commonly 0 or 2+)
          // Status 1 is typically "active", 0 might be "inactive"
          if (statusNum === 0) continue
          
          const name = cls.name || cls.description || cls.course_name || ''
          // Use internal class ID (cls.id) as the primary key
          // This matches schedule.internal_class_id from Class Schedules API
          if (cls.id != null) {
            const internalId = String(cls.id)
            classNamesMap[internalId] = name
            activeClassIds.add(internalId)
          }
        }
        if (classes.length < 1000) break
        classPage++
      }
      
      // Fetch class schedules
      const scheduleRes = await fetch(`${VERACROSS_API_BASE}/academics/class_schedules`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '1000',
        },
      })
      
      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json()
        const schedules = scheduleData.data || scheduleData || []
        
        // Get resource info for matching
        const roomDesc = resource?.description?.toLowerCase() || ''
        const roomAbbrev = resource?.abbreviation?.toLowerCase() || ''
        const roomNumber = (resource?.description || '').match(/^\d+/)?.[0] || ''
        
        // Room grouping: 313 includes 313A, 313B; Ulam includes Ulam 1, Ulam 2; etc.
        const roomMatchesGroup = (scheduleRoomDesc: string, scheduleRoomNumber: string): boolean => {
          // Skip empty rooms
          if (!scheduleRoomDesc || scheduleRoomDesc === '<none specified>' || scheduleRoomDesc === 'none') return false
          
          // For numbered rooms (313, 404, etc): match if schedule room STARTS with that number
          if (roomNumber && scheduleRoomNumber) {
            if (scheduleRoomNumber === roomNumber || scheduleRoomDesc.startsWith(roomNumber)) {
              return true
            }
          }
          
          // For named rooms (Ulam, Playroof): match if schedule room STARTS with the base name
          if (roomDesc && scheduleRoomDesc) {
            // Exact match
            if (roomDesc === scheduleRoomDesc) return true
            // Base name match (ulam matches ulam 1, ulam 2)
            if (scheduleRoomDesc.startsWith(roomDesc + ' ') || scheduleRoomDesc.startsWith(roomDesc + '-')) return true
            // Reverse: if we're booking "ulam 1", also show parent "ulam" events
            if (roomDesc.startsWith(scheduleRoomDesc + ' ') || roomDesc.startsWith(scheduleRoomDesc + '-')) return true
          }
          
          // Abbreviation match
          if (roomAbbrev && roomAbbrev === scheduleRoomDesc) return true
          
          return false
        }
        
        // Deduplicate schedules
        const seenKeys = new Set<string>()
        
        // Tracking counters
        let totalSchedules = schedules.length
        let roomMatches = 0
        let dayMatches = 0
        let activeMatches = 0
        let timeOverlaps = 0
        
        for (const schedule of schedules) {
          const scheduleRoomDesc = (schedule.room?.description || '').toLowerCase().trim()
          const scheduleRoomNumber = (schedule.room?.description || '').match(/^\d+/)?.[0] || ''
          
          // Check room grouping
          if (!roomMatchesGroup(scheduleRoomDesc, scheduleRoomNumber)) continue
          roomMatches++
          
          // Check day pattern
          const dayPattern = schedule.day?.description || schedule.day?.abbreviation || ''
          if (!patternIncludesDay(dayPattern, dayOfWeek)) continue
          dayMatches++
          
          // Dedupe by class_id + room
          const key = `${schedule.class_id || schedule.internal_class_id}-${scheduleRoomDesc}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          
          const classStart = parseTimeToMinutes(normalizeTime(schedule.start_time))
          const classEnd = parseTimeToMinutes(normalizeTime(schedule.end_time))
          
          if (classStart === null || classEnd === null) continue
          
          // Use internal_class_id - matches cls.id from /academics/classes
          const internalId = schedule.internal_class_id != null ? String(schedule.internal_class_id) : ''
          
          // Capture first schedule that passes room+day for debug
          if (!sampleSchedule) {
            sampleSchedule = {
              id: schedule.id,
              class_id: schedule.class_id,
              internal_class_id: schedule.internal_class_id,
              internalIdUsed: internalId,
              room: schedule.room?.description,
              day: schedule.day?.description
            }
          }
          
          // Check if this class is active using internal_class_id
          if (!internalId || !activeClassIds.has(internalId)) continue
          activeMatches++
          
          // Get class name using the internal ID
          const className = classNamesMap[internalId] || schedule.block?.description || 'Class'
          
          if (timesOverlap(requestStart, requestEnd, classStart, classEnd)) {
            timeOverlaps++
            conflicts.push({
              type: 'conflict',
              title: className,
              startTime: normalizeTime(schedule.start_time) || '',
              endTime: normalizeTime(schedule.end_time) || '',
              message: `❌ Conflict: ${className} (${formatTimeDisplay(classStart)}-${formatTimeDisplay(classEnd)})`
            })
          } else {
            if (timesClose(classEnd, requestStart)) {
              warnings.push({
                type: 'warning',
                title: className,
                startTime: normalizeTime(schedule.start_time) || '',
                endTime: normalizeTime(schedule.end_time) || '',
                message: `⚠️ Note: ${className} ends ${requestStart - classEnd} min before`
              })
            }
            if (timesClose(requestEnd, classStart)) {
              warnings.push({
                type: 'warning',
                title: className,
                startTime: normalizeTime(schedule.start_time) || '',
                endTime: normalizeTime(schedule.end_time) || '',
                message: `⚠️ Note: ${className} starts ${classStart - requestEnd} min after`
              })
            }
          }
        }
        
        // Build debug info
        const debug = {
          resource: {
            id: resourceId,
            description: resource?.description,
            abbreviation: resource?.abbreviation,
            roomNumber
          },
          veracrossReservations: veracrossReservationsDebug,
          classSchedules: {
            totalSchedules,
            roomMatches,
            dayMatches,
            activeMatches,
            timeOverlaps
          },
          requestedDay: dayOfWeek,
          requestedTime: { start: requestStart, end: requestEnd },
          sampleClass,
          sampleSchedule,
          activeClassIdsCount: activeClassIds.size,
          sampleActiveIds: Array.from(activeClassIds).slice(0, 3)
        }
        
        return NextResponse.json({
          available: conflicts.length === 0,
          conflicts,
          warnings,
          debug
        })
      }
    } catch (err: any) {
      console.error('Class schedule check failed:', err?.message || err)
      // Don't fail the whole request, just skip class checking
    }
    
    // Fallback response
    return NextResponse.json({
      available: conflicts.length === 0,
      conflicts,
      warnings,
      debug: { 
        veracrossReservations: veracrossReservationsDebug,
        error: 'Class schedule check failed or no data' 
      }
    })
    
  } catch (error: any) {
    console.error('Availability check error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
