import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross API config
const VERACROSS_API_BASE = 'https://api.veracross.com/shefa/v3'
const VERACROSS_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'
const CLASS_SCHEDULES_SCOPE = 'academics.class_schedules:list'

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

// Check if a days pattern includes a specific day of week
function patternIncludesDay(pattern: string, dayOfWeek: number): boolean {
  if (!pattern) return false
  const validCodes = dayCodeMap[dayOfWeek]
  const patternUpper = pattern.toUpperCase()
  return validCodes.some(code => patternUpper.includes(code.toUpperCase()))
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
    
    // Build room number lookup for class schedules
    const resourceByRoomNumber: Record<string, number> = {}
    for (const r of resources || []) {
      const roomNum = (r.description || r.abbreviation || '').match(/^\d+/)?.[0]
      if (roomNum) {
        resourceByRoomNumber[roomNum] = r.id
      }
      // Also try abbreviation directly
      if (r.abbreviation) {
        resourceByRoomNumber[r.abbreviation.toLowerCase()] = r.id
      }
    }
    
    // Fetch class schedules from Veracross API
    let classSchedulesError: string | undefined
    if (includeClasses) {
      try {
        const accessToken = await getClassSchedulesToken()
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
        
        // Process class schedules and expand to dates
        for (const schedule of allSchedules) {
          const roomDesc = (schedule.room?.description || '').trim()
          const roomAbbrev = (schedule.room?.abbreviation || '').trim()
          
          if (!roomDesc && !roomAbbrev) continue
          if (roomDesc === '<None Specified>') continue
          
          // Extract room number
          const apiRoomNumber = roomDesc.match(/^\d+/)?.[0] || roomAbbrev.toLowerCase()
          
          // Find matching resource
          let resourceId = resourceByRoomNumber[apiRoomNumber]
          if (!resourceId && roomAbbrev) {
            resourceId = resourceByRoomNumber[roomAbbrev.toLowerCase()]
          }
          
          if (!resourceId) continue
          
          // Get day pattern
          const dayPattern = schedule.day?.name || schedule.day?.abbreviation || 
                            schedule.day_name || schedule.day_of_week || ''
          
          // Expand to actual dates
          for (const date of datesInRange) {
            const dayOfWeek = date.getDay()
            
            if (!patternIncludesDay(dayPattern, dayOfWeek)) continue
            
            const dateStr = date.toISOString().split('T')[0]
            const className = schedule.class?.name || schedule.class_name || 
                             schedule.course?.name || 'Class'
            
            if (!eventsByResource[resourceId]) {
              eventsByResource[resourceId] = []
            }
            
            eventsByResource[resourceId].push({
              id: `class-${schedule.id}-${dateStr}`,
              title: className,
              start_date: dateStr,
              end_date: null,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              all_day: false,
              location: roomDesc || roomAbbrev,
              resource_id: resourceId,
              is_hidden: false,
              has_conflict: false,
              is_class: true, // Flag to distinguish from regular events
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

// Natural sort for room numbers (311 before 1011)
function naturalSort(a: string, b: string): number {
  const aParts = a.split(/(\d+)/)
  const bParts = b.split(/(\d+)/)
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || ''
    const bPart = bParts[i] || ''
    
    const aNum = parseInt(aPart)
    const bNum = parseInt(bPart)
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum
    } else {
      const cmp = aPart.localeCompare(bPart)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}
