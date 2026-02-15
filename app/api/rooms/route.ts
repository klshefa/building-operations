import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross API config
const VERACROSS_API_BASE = 'https://api.veracross.com/shefa/v3'
const VERACROSS_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'
const CLASS_SCHEDULES_SCOPE = 'academics.class_schedules:list academics.classes:list'

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

// Check if a day pattern matches a specific day of week
function patternIncludesDay(pattern: string, dayOfWeek: number): boolean {
  if (!pattern) return false
  const patternLower = pattern.toLowerCase().trim()
  
  // Check for exact match of full day name or abbreviation
  const mappedDay = dayNameToNumber[patternLower]
  if (mappedDay !== undefined) {
    return mappedDay === dayOfWeek
  }
  
  // For compound patterns like "MWF" or "M,W,F", check each part
  // But be careful: "Monday" should NOT match Saturday just because it contains 'a'
  // Only split on non-letter characters
  const parts = patternLower.split(/[^a-z]+/).filter(Boolean)
  for (const part of parts) {
    const partDay = dayNameToNumber[part]
    if (partDay === dayOfWeek) return true
  }
  
  return false
}

// GET - Fetch rooms with their events for a date range
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const resourceType = searchParams.get('resourceType')
    const includeClasses = searchParams.get('includeClasses') !== 'false' // Default true
    
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
    
    if (resourceType) {
      resourceQuery = resourceQuery.eq('resource_type', resourceType)
    }
    
    const { data: resourcesRaw, error: resourceError } = await resourceQuery
    
    // Sort resources naturally (so 311 comes before 1011)
    const resources = (resourcesRaw || []).sort((a, b) => {
      return naturalSort(a.description || a.abbreviation || '', b.description || b.abbreviation || '')
    })
    
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
    
    // Build room lookup for class schedules - try multiple matching strategies
    const resourceByRoomKey: Record<string, number> = {}
    for (const r of resources || []) {
      // Match by room number at start of description (e.g., "301B Classroom" -> "301")
      const roomNumFromDesc = (r.description || '').match(/^\d+/)?.[0]
      if (roomNumFromDesc) {
        resourceByRoomKey[roomNumFromDesc] = r.id
      }
      // Match by room number at start of abbreviation (e.g., "301B" -> "301")
      const roomNumFromAbbr = (r.abbreviation || '').match(/^\d+/)?.[0]
      if (roomNumFromAbbr) {
        resourceByRoomKey[roomNumFromAbbr] = r.id
      }
      // Match by full abbreviation
      if (r.abbreviation) {
        resourceByRoomKey[r.abbreviation.toLowerCase()] = r.id
      }
      // Match by full description (for rooms like "Beit Midrash")
      if (r.description) {
        resourceByRoomKey[r.description.toLowerCase()] = r.id
      }
    }
    
    // Fetch class schedules from Veracross API
    let classSchedulesError: string | undefined
    if (includeClasses) {
      try {
        const accessToken = await getClassSchedulesToken()
        
        // First, fetch all classes to get their names and status
        const classNamesMap: Record<string, string> = {}
        const activeClassIds = new Set<string>()
        let classPage = 1
        while (classPage <= 10) {
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
          
          if (classes.length < 1000) break
          classPage++
        }
        
        // Now fetch class schedules
        const apiUrl = `${VERACROSS_API_BASE}/academics/class_schedules`
        const allSchedules: any[] = []
        let currentPage = 1
        const maxPages = 10
        
        while (currentPage <= maxPages) {
          const response = await fetch(apiUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json',
              'X-Page-Size': '1000',
              'X-Page-Number': String(currentPage),
            },
          })
          
          if (!response.ok) break
          
          const data = await response.json()
          const pageSchedules = data.data || data || []
          allSchedules.push(...pageSchedules)
          
          if (pageSchedules.length < 1000) break
          currentPage++
        }
        
        // Generate dates in range
        const start = new Date(startDate)
        const end = new Date(endDate)
        const datesInRange: Date[] = []
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          datesInRange.push(new Date(d))
        }
        
        // Deduplicate schedules - Veracross often returns multiple records for same class meeting
        // Group by internal_class_id + day + room, keep earliest start time
        const scheduleKey = (s: any) => {
          // Use internal_class_id (system-generated) as primary key
          const classId = s.internal_class_id || s.class_id || s.id
          const day = s.day?.id || s.day?.abbreviation || ''
          const room = s.room?.id || s.room?.abbreviation || ''
          return `${classId}-${day}-${room}`
        }
        
        const dedupedSchedules: any[] = []
        const seenKeys = new Map<string, any>()
        
        for (const schedule of allSchedules) {
          const key = scheduleKey(schedule)
          const existing = seenKeys.get(key)
          
          if (!existing) {
            seenKeys.set(key, schedule)
            dedupedSchedules.push(schedule)
          } else {
            // Keep the one with earliest start time, but extend end time if needed
            const existingStart = parseTime(normalizeTime(existing.start_time) || '')
            const newStart = parseTime(normalizeTime(schedule.start_time) || '')
            const existingEnd = parseTime(normalizeTime(existing.end_time) || '')
            const newEnd = parseTime(normalizeTime(schedule.end_time) || '')
            
            if (newStart !== null && existingStart !== null && newStart < existingStart) {
              existing.start_time = schedule.start_time
            }
            if (newEnd !== null && existingEnd !== null && newEnd > existingEnd) {
              existing.end_time = schedule.end_time
            }
          }
        }
        
        // Process deduplicated class schedules
        for (const schedule of dedupedSchedules) {
          const roomDesc = (schedule.room?.description || '').trim()
          const roomAbbrev = (schedule.room?.abbreviation || '').trim()
          
          if (!roomDesc && !roomAbbrev) continue
          if (roomDesc === '<None Specified>') continue
          
          // Find matching resource - try multiple strategies
          let resourceId: number | undefined
          
          // Try room number at start (e.g., "301B Classroom" -> "301")
          const apiRoomNumber = roomDesc.match(/^\d+/)?.[0]
          if (apiRoomNumber) {
            resourceId = resourceByRoomKey[apiRoomNumber]
          }
          // Try full room description
          if (!resourceId && roomDesc) {
            resourceId = resourceByRoomKey[roomDesc.toLowerCase()]
          }
          // Try abbreviation
          if (!resourceId && roomAbbrev) {
            resourceId = resourceByRoomKey[roomAbbrev.toLowerCase()]
          }
          
          if (!resourceId) continue
          
          // Get day pattern
          const dayPattern = schedule.day?.description || schedule.day?.abbreviation || 
                            schedule.day_name || schedule.day_of_week || ''
          
          // Use internal_class_id - matches cls.id from /academics/classes
          const internalId = schedule.internal_class_id != null ? String(schedule.internal_class_id) : ''
          
          // Check if this class is active using internal_class_id
          if (!internalId || !activeClassIds.has(internalId)) continue
          
          // Get class name using the internal ID
          const className = classNamesMap[internalId] || 
                           schedule.block?.description || 
                           'Class'
          
          // Extract teacher info
          const teacher = schedule.primary_teacher_name && schedule.primary_teacher_name !== 'None'
                         ? schedule.primary_teacher_name
                         : ''
          
          // Expand to actual dates
          for (const date of datesInRange) {
            const dayOfWeek = date.getDay()
            
            if (!patternIncludesDay(dayPattern, dayOfWeek)) continue
            
            const dateStr = date.toISOString().split('T')[0]
            
            if (!eventsByResource[resourceId]) {
              eventsByResource[resourceId] = []
            }
            
            eventsByResource[resourceId].push({
              id: `class-${schedule.id}-${dateStr}`,
              title: className,
              start_date: dateStr,
              end_date: null,
              start_time: normalizeTime(schedule.start_time),
              end_time: normalizeTime(schedule.end_time),
              all_day: false,
              location: roomDesc || roomAbbrev,
              resource_id: resourceId,
              is_hidden: false,
              has_conflict: false,
              is_class: true,
              // Additional class details for popup
              teacher: teacher,
              day_pattern: dayPattern,
            } as any)
          }
        }
      } catch (err: any) {
        classSchedulesError = err.message
        console.warn('Class schedules fetch failed:', err.message)
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
      classSchedulesError,
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

// Extract HH:MM from ISO time like "1900-01-01T09:00:00Z" or return as-is if already HH:MM
function normalizeTime(timeStr: string | null | undefined): string | null {
  if (!timeStr) return null
  
  // Handle ISO datetime format
  const iso = timeStr.match(/T(\d{2}):(\d{2})/)
  if (iso) {
    return `${iso[1]}:${iso[2]}`
  }
  
  // Already HH:MM format
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) {
    return timeStr
  }
  
  return null
}

// Priority rooms that should appear first (common spaces)
const PRIORITY_ROOMS = [
  'beit midrash', 'chadar ochel', 'ulam', 'mercaz', 'playroof', 'lobby'
]

// Check if a room name is a priority room
function getPriorityIndex(name: string): number {
  const lower = name.toLowerCase()
  for (let i = 0; i < PRIORITY_ROOMS.length; i++) {
    if (lower.includes(PRIORITY_ROOMS[i])) return i
  }
  return -1
}

// Natural sort for room numbers (101 before 1012, 311 before 1011)
// Priority rooms come first, then numbered rooms
function naturalSort(a: string, b: string): number {
  // Check if either is a priority room
  const aPriority = getPriorityIndex(a)
  const bPriority = getPriorityIndex(b)
  
  // Both priority - sort by priority order
  if (aPriority >= 0 && bPriority >= 0) {
    return aPriority - bPriority
  }
  // Only a is priority - a comes first
  if (aPriority >= 0) return -1
  // Only b is priority - b comes first
  if (bPriority >= 0) return 1
  
  // Neither is priority - sort by number
  const aMatch = a.match(/^(\d+)/)
  const bMatch = b.match(/^(\d+)/)
  
  const aNum = aMatch ? parseInt(aMatch[1]) : null
  const bNum = bMatch ? parseInt(bMatch[1]) : null
  
  // Both have leading numbers - sort numerically
  if (aNum !== null && bNum !== null) {
    if (aNum !== bNum) return aNum - bNum
    const aRest = a.slice(aMatch![0].length)
    const bRest = b.slice(bMatch![0].length)
    return aRest.localeCompare(bRest)
  }
  
  // Numbers come before other non-priority names
  if (aNum !== null) return -1
  if (bNum !== null) return 1
  
  // Neither has leading number - alphabetical
  return a.localeCompare(b)
}
