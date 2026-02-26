import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveResourceId, resolveClassScheduleRoom, resolveVcReservationResource } from '@/lib/utils/resourceResolver'

// Veracross OAuth configuration
const VERACROSS_CLIENT_ID = process.env.VERACROSS_CLIENT_ID
const VERACROSS_CLIENT_SECRET = process.env.VERACROSS_CLIENT_SECRET
const VERACROSS_TOKEN_URL = process.env.VERACROSS_TOKEN_URL || 'https://accounts.veracross.com/shefa/oauth/token'
const VERACROSS_API_BASE = process.env.VERACROSS_API_BASE || 'https://api.veracross.com/shefa/v3'

// Scopes
const CLASS_SCHEDULES_SCOPE = 'academics.class_schedules:list'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get a token with class schedules scope
async function getClassSchedulesToken(): Promise<string> {
  if (!VERACROSS_CLIENT_ID || !VERACROSS_CLIENT_SECRET) {
    throw new Error('Veracross OAuth credentials not configured')
  }

  const tokenResponse = await fetch(VERACROSS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: VERACROSS_CLIENT_ID,
      client_secret: VERACROSS_CLIENT_SECRET,
      scope: CLASS_SCHEDULES_SCOPE,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Failed to get class schedules token: ${tokenResponse.status} - ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// Parse time string to minutes since midnight for comparison
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  
  // Handle ISO datetime format "1900-01-01T09:00:00Z" or "2026-02-16T09:00:00Z"
  const iso = timeStr.match(/T(\d{2}):(\d{2}):(\d{2})/)
  if (iso) {
    return parseInt(iso[1]) * 60 + parseInt(iso[2])
  }
  
  // Handle "HH:MM" format
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) {
    return parseInt(hhmm[1]) * 60 + parseInt(hhmm[2])
  }
  
  // Handle "HH:MM:SS" format
  const hhmmss = timeStr.match(/^(\d{1,2}):(\d{2}):\d{2}$/)
  if (hhmmss) {
    return parseInt(hhmmss[1]) * 60 + parseInt(hhmmss[2])
  }
  
  // Handle "H:MM am/pm" format
  const ampm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (ampm) {
    let hours = parseInt(ampm[1])
    const minutes = parseInt(ampm[2])
    const period = ampm[3].toLowerCase()
    
    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    
    return hours * 60 + minutes
  }
  
  return null
}

// Format time for display (extracts time from ISO or returns as-is)
function formatTimeForDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return ''
  
  // Handle ISO datetime format - extract just the time part
  const iso = timeStr.match(/T(\d{2}):(\d{2})/)
  if (iso) {
    const hours = parseInt(iso[1])
    const minutes = iso[2]
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${period}`
  }
  
  return timeStr
}

// Check if two time ranges overlap
function timesOverlap(
  start1: number | null,
  end1: number | null,
  start2: number | null,
  end2: number | null
): boolean {
  if (start1 === null || end1 === null || start2 === null || end2 === null) {
    return false
  }
  return start1 < end2 && end1 > start2
}

// Detect parent/child/sibling resource relationships
function getResourceRelationships(resourceName: string): {
  parent: string | null,
  siblings: string[],
  isChild: boolean
} {
  const sideMatch = resourceName.match(/^(.+?)\s+Side\s+(\d+)$/i)
  
  if (sideMatch) {
    const parent = sideMatch[1].trim()
    const sideNum = parseInt(sideMatch[2])
    const siblings: string[] = []
    for (let i = 1; i <= 2; i++) {
      if (i !== sideNum) {
        siblings.push(`${parent} Side ${i}`)
      }
    }
    return { parent, siblings, isChild: true }
  }
  
  return { parent: null, siblings: [], isChild: false }
}

// Get all resource names to check for a given resource
function getRelatedResourceNames(resourceName: string): {
  blocking: string[],
  adjacent: string[]
} {
  const relationships = getResourceRelationships(resourceName)
  
  const blocking: string[] = [resourceName]
  const adjacent: string[] = []
  
  if (relationships.isChild && relationships.parent) {
    blocking.push(relationships.parent)
    adjacent.push(...relationships.siblings)
  } else {
    blocking.push(`${resourceName} Side 1`)
    blocking.push(`${resourceName} Side 2`)
  }
  
  return { blocking, adjacent }
}

// Map day of week number to possible day codes
const dayCodeMap: Record<number, string[]> = {
  0: ['U', 'Su', 'SU', 'Sun'],
  1: ['M', 'Mo', 'MO', 'Mon'],
  2: ['T', 'Tu', 'TU', 'Tue'],
  3: ['W', 'We', 'WE', 'Wed'],
  4: ['R', 'Th', 'TH', 'Thu'],
  5: ['F', 'Fr', 'FR', 'Fri'],
  6: ['S', 'Sa', 'SA', 'Sat'],
}

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

// Check if a days pattern includes a specific day of week
function patternIncludesDay(pattern: string, dayOfWeek: number): boolean {
  if (!pattern) return true // No pattern means all days
  const validCodes = dayCodeMap[dayOfWeek]
  const patternUpper = pattern.toUpperCase()
  return validCodes.some(code => patternUpper.includes(code.toUpperCase()))
}

export interface AvailabilityRequest {
  resource_name: string
  resource_id?: number
  date: string
  start_time: string
  end_time: string
  exclude_event_id?: string  // When editing, exclude current event from results
  exclude_event_name?: string // Fallback: exclude by matching name
}

export interface ConflictInfo {
  type: 'definite' | 'possible'
  source: 'class_schedule' | 'reservation'
  description: string
  resource_name?: string
  start_date?: string
  end_date?: string
  start_time?: string
  end_time?: string
  class_name?: string
  days_pattern?: string
}

export interface AdjacentBooking {
  source: 'class_schedule' | 'reservation'
  description: string
  resource_name: string
  start_time?: string
  end_time?: string
  days_pattern?: string
  note: string
}

export interface AvailabilityResponse {
  available: boolean
  conflicts: ConflictInfo[]
  possible_conflicts: ConflictInfo[]
  adjacent_bookings: AdjacentBooking[]
  debug?: {
    class_schedules_checked: number
    class_schedules_total?: number
    class_schedules_pages?: number
    class_schedules_error?: string
    reservations_checked: number
    checking_day: string
    requested_time: string
  }
  error?: string
}

export async function POST(request: Request) {
  try {
    const body: AvailabilityRequest = await request.json()
    const { resource_name, date, start_time, end_time, exclude_event_id, exclude_event_name } = body

    if (!resource_name || !date) {
      return NextResponse.json({
        available: false,
        conflicts: [],
        possible_conflicts: [],
        adjacent_bookings: [],
        error: 'resource_name and date are required'
      } as AvailabilityResponse, { status: 400 })
    }
    
    console.log(`Exclude event: id=${exclude_event_id}, name=${exclude_event_name}`)

    const supabase = getSupabaseClient()
    
    // Parse the requested date to get day of week
    const checkDate = new Date(date + 'T12:00:00')
    const dayOfWeek = checkDate.getDay()
    const dayName = dayNames[dayOfWeek]
    
    const requestedStart = parseTimeToMinutes(start_time)
    const requestedEnd = parseTimeToMinutes(end_time)

    // Get related resources (blocking and adjacent)
    const { blocking: blockingResources, adjacent: adjacentResources } = getRelatedResourceNames(resource_name)
    
    // Resolve all resource names to IDs via alias table
    const blockingIds = new Set<number>()
    const adjacentIds = new Set<number>()
    for (const name of blockingResources) {
      const id = await resolveResourceId(name, supabase)
      if (id != null) blockingIds.add(id)
    }
    for (const name of adjacentResources) {
      const id = await resolveResourceId(name, supabase)
      if (id != null) adjacentIds.add(id)
    }
    
    console.log(`Checking availability for ${resource_name} on ${date} (${dayName})`)
    console.log(`Blocking resources: ${blockingResources.join(', ')} → IDs: ${[...blockingIds].join(', ')}`)
    console.log(`Adjacent resources: ${adjacentResources.join(', ')} → IDs: ${[...adjacentIds].join(', ')}`)

    const conflicts: ConflictInfo[] = []
    const possibleConflicts: ConflictInfo[] = []
    const adjacentBookings: AdjacentBooking[] = []
    
    let classSchedulesChecked = 0
    let classSchedulesTotal: number | undefined
    let classSchedulesPages: number | undefined
    let classSchedulesError: string | undefined
    let reservationsChecked = 0

    // ==========================================
    // CHECK 1: Class Schedules (Veracross API)
    // Pagination is controlled via headers: X-Page-Number, X-Page-Size
    // ==========================================
    try {
      const accessToken = await getClassSchedulesToken()
      
      const apiUrl = `${VERACROSS_API_BASE}/academics/class_schedules`
      const allSchedules: any[] = []
      let currentPage = 1
      const maxPages = 20 // Safety limit
      
      while (currentPage <= maxPages) {
        const response = await fetch(apiUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'X-Page-Size': '1000',
            'X-Page-Number': String(currentPage),
          },
        })

        if (!response.ok) {
          classSchedulesError = `API returned ${response.status} on page ${currentPage}`
          break
        }
        
        const data = await response.json()
        const pageSchedules = data.data || data || []
        allSchedules.push(...pageSchedules)
        
        // Check if there are more pages
        const totalCount = parseInt(response.headers.get('X-Total-Count') || '0')
        const pageSize = 1000
        
        // Save for debug output
        classSchedulesTotal = totalCount || allSchedules.length
        classSchedulesPages = currentPage
        
        console.log(`Page ${currentPage}: fetched ${pageSchedules.length} (running total: ${allSchedules.length}, header total: ${totalCount})`)
        
        // Continue fetching if we got a full page OR if header says there's more
        const hasMoreByHeader = totalCount > 0 && allSchedules.length < totalCount
        const hasMoreByPageSize = pageSchedules.length >= pageSize
        
        if (!hasMoreByHeader && !hasMoreByPageSize) {
          break
        }
        if (pageSchedules.length === 0) {
          break
        }
        currentPage++
      }

      if (allSchedules.length > 0) {
        const schedules = allSchedules
        classSchedulesChecked = schedules.length
        classSchedulesPages = classSchedulesPages || 1
        
        console.log(`Fetched ${schedules.length} total class schedules from Veracross`)
        
        for (const schedule of schedules) {
          // Get room info from schedule - API returns room.description and room.abbreviation
          const roomDesc = (schedule.room?.description || '').trim()
          const roomAbbrev = (schedule.room?.abbreviation || '').trim()
          const roomName = (schedule.room?.name || schedule.room_name || schedule.location || '').trim()
          
          // Skip rooms with no meaningful identifier
          if (!roomDesc && !roomAbbrev && !roomName) continue
          if (roomDesc === '<None Specified>') continue
          
          // Resolve room via alias table
          const scheduleRoomId = await resolveClassScheduleRoom(schedule.room, supabase)
          
          const isBlocking = scheduleRoomId != null && blockingIds.has(scheduleRoomId)
          const isAdjacent = scheduleRoomId != null && adjacentIds.has(scheduleRoomId)
          
          if (!isBlocking && !isAdjacent) continue
          
          // Use the best available room identifier for display
          const displayRoomName = roomDesc || roomAbbrev || roomName
          
          // Check if this class meets on the requested day
          // The API should return day info - check various possible field names
          const classDay = schedule.day?.name || schedule.day?.abbreviation || 
                          schedule.day_name || schedule.day_of_week || ''
          
          // Skip if this class doesn't meet on our day
          if (classDay && !patternIncludesDay(classDay, dayOfWeek)) {
            continue
          }
          
          // Check time overlap
          const classStart = parseTimeToMinutes(schedule.start_time)
          const classEnd = parseTimeToMinutes(schedule.end_time)
          
          const overlaps = timesOverlap(requestedStart, requestedEnd, classStart, classEnd)
          
          if (!overlaps) continue
          
          const className = schedule.class?.name || schedule.class_name || 
                           schedule.course?.name || 'Class'
          
          const conflictInfo: ConflictInfo = {
            type: (classStart !== null && classEnd !== null) ? 'definite' : 'possible',
            source: 'class_schedule',
            description: className,
            resource_name: displayRoomName,
            start_time: formatTimeForDisplay(schedule.start_time),
            end_time: formatTimeForDisplay(schedule.end_time),
            class_name: className,
            days_pattern: classDay,
          }
          
          if (isBlocking) {
            if (conflictInfo.type === 'definite') {
              conflicts.push(conflictInfo)
            } else {
              possibleConflicts.push(conflictInfo)
            }
          } else if (isAdjacent) {
            adjacentBookings.push({
              source: 'class_schedule',
              description: className,
              resource_name: displayRoomName,
              start_time: formatTimeForDisplay(schedule.start_time),
              end_time: formatTimeForDisplay(schedule.end_time),
              days_pattern: classDay,
              note: `Class in adjacent space (${displayRoomName})`,
            })
          }
        }
      }
    } catch (classError: any) {
      console.warn('Class schedules check failed:', classError.message)
      classSchedulesError = classError.message
      // Continue to reservation check even if class check fails
    }

    // ==========================================
    // CHECK 2: Resource Reservations (Local DB)
    // Uses ops_raw_events from BigQuery sync which has the days pattern
    // ==========================================
    try {
      // Build list of all resource names to check (blocking + adjacent)
      const allResourcesToCheck = [...blockingResources, ...adjacentResources]
      
      // If we have an exclude_event_id, look up related raw_event_ids from ops_event_matches
      let excludeRawEventIds: string[] = []
      if (exclude_event_id) {
        const { data: matches } = await supabase
          .from('ops_event_matches')
          .select('raw_event_id')
          .eq('event_id', exclude_event_id)
        
        if (matches && matches.length > 0) {
          excludeRawEventIds = matches.map(m => m.raw_event_id)
          console.log(`Found ${excludeRawEventIds.length} related raw events to exclude`)
        }
      }
      
      // Query ops_raw_events for reservations on this date
      // We filter by date range, and then by recurring_pattern client-side
      const { data: reservations, error: dbError } = await supabase
        .from('ops_raw_events')
        .select('*')
        .eq('source', 'bigquery_resource')
        .lte('start_date', date) // Reservation starts on or before our date
        .or(`end_date.gte.${date},end_date.is.null`) // And ends on or after (or is single-day)
      
      if (dbError) {
        console.warn('Could not fetch reservations from local DB:', dbError)
      } else if (reservations) {
        console.log(`Fetched ${reservations.length} reservations from local database`)
        reservationsChecked = reservations.length
        
        for (const res of reservations) {
          // Skip if this is the event we're currently editing
          // Check various ID fields that might match
          if (exclude_event_id) {
            if (res.id === exclude_event_id || 
                res.source_id === exclude_event_id ||
                res.reservation_id === exclude_event_id ||
                excludeRawEventIds.includes(res.id)) {
              console.log(`Skipping reservation "${res.title}" - matches exclude_event_id or related raw event`)
              continue
            }
          }
          
          // Also skip by matching name + date + time (fallback for when ID doesn't match)
          // Compare parsed time values instead of formatted strings for reliability
          if (exclude_event_name) {
            const titleMatch = res.title?.toLowerCase().trim() === exclude_event_name?.toLowerCase().trim()
            const dateMatch = res.start_date === date
            const startTimeMatch = parseTimeToMinutes(res.start_time) === parseTimeToMinutes(start_time)
            const endTimeMatch = parseTimeToMinutes(res.end_time) === parseTimeToMinutes(end_time)
            
            if (titleMatch && dateMatch && startTimeMatch && endTimeMatch) {
              console.log(`Skipping reservation "${res.title}" - matches by name/date/time`)
              continue
            }
          }
          
          // Resolve reservation resource via alias table
          const resResourceId = await resolveVcReservationResource(res, supabase)
          
          const isBlocking = resResourceId != null && blockingIds.has(resResourceId)
          const isAdjacent = resResourceId != null && adjacentIds.has(resResourceId)
          
          if (!isBlocking && !isAdjacent) continue
          
          // Check if this is a recurring reservation and if our day matches
          const daysPattern = res.recurring_pattern
          if (daysPattern && res.start_date !== res.end_date) {
            // It's recurring - check if our day matches the pattern
            if (!patternIncludesDay(daysPattern, dayOfWeek)) {
              console.log(`Skipping reservation "${res.title}" - days ${daysPattern} doesn't include ${dayName}`)
              continue
            }
          }
          
          // Check time overlap
          const resStart = parseTimeToMinutes(res.start_time)
          const resEnd = parseTimeToMinutes(res.end_time)
          
          const overlaps = timesOverlap(requestedStart, requestedEnd, resStart, resEnd)
          
          if (!overlaps && resStart !== null && resEnd !== null) continue
          
          const resDisplayName = res.resource || res.location || res.title || 'Unknown'
          
          const conflictInfo: ConflictInfo = {
            type: (resStart !== null && resEnd !== null && overlaps) ? 'definite' : 'possible',
            source: 'reservation',
            description: res.title || 'Reservation',
            resource_name: resDisplayName,
            start_date: res.start_date,
            end_date: res.end_date,
            start_time: formatTimeForDisplay(res.start_time),
            end_time: formatTimeForDisplay(res.end_time),
            days_pattern: daysPattern,
          }
          
          if (isBlocking) {
            if (conflictInfo.type === 'definite') {
              conflicts.push(conflictInfo)
            } else {
              possibleConflicts.push(conflictInfo)
            }
          } else if (isAdjacent) {
            adjacentBookings.push({
              source: 'reservation',
              description: res.title || 'Reservation',
              resource_name: resDisplayName,
              start_time: formatTimeForDisplay(res.start_time),
              end_time: formatTimeForDisplay(res.end_time),
              days_pattern: daysPattern,
              note: `Reservation in adjacent space (${resDisplayName})`,
            })
          }
        }
      }
    } catch (resError: any) {
      console.warn('Reservations check failed:', resError.message)
    }

    const available = conflicts.length === 0

    return NextResponse.json({
      available,
      conflicts,
      possible_conflicts: possibleConflicts,
      adjacent_bookings: adjacentBookings,
      debug: {
        class_schedules_checked: classSchedulesChecked,
        class_schedules_total: classSchedulesTotal,
        class_schedules_pages: classSchedulesPages,
        class_schedules_error: classSchedulesError,
        reservations_checked: reservationsChecked,
        checking_day: `${dayName} (${dayOfWeek})`,
        requested_time: `${start_time} - ${end_time}`,
      },
    } as AvailabilityResponse)

  } catch (error: any) {
    console.error('Availability check error:', error)
    return NextResponse.json({
      available: false,
      conflicts: [],
      possible_conflicts: [],
      adjacent_bookings: [],
      error: error.message || 'Failed to check availability'
    } as AvailabilityResponse, { status: 500 })
  }
}
