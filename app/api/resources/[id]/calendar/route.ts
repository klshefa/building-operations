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
    const { data: opsEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, location, status')
      .eq('resource_id', resourceId)
      .eq('start_date', date)
      .eq('is_hidden', false)
    
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
    
    // 2. Get class schedules for this resource
    try {
      const accessToken = await getClassSchedulesToken()
      const dateObj = new Date(date + 'T12:00:00')
      const dayOfWeek = dateObj.getDay()
      
      // Fetch class names
      const classNamesMap: Record<string, string> = {}
      const classesRes = await fetch(`${VERACROSS_API_BASE}/academics/classes?X-Page-Size=1000`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })
      
      if (classesRes.ok) {
        const classesData = await classesRes.json()
        const classes = classesData.data || classesData || []
        for (const cls of classes) {
          const name = cls.name || cls.description || cls.course_name || ''
          if (cls.class_id) classNamesMap[cls.class_id] = name
          if (cls.id) classNamesMap[String(cls.id)] = name
        }
      }
      
      // Fetch schedules
      const scheduleRes = await fetch(`${VERACROSS_API_BASE}/academics/class_schedules?X-Page-Size=1000`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json',
        },
      })
      
      if (scheduleRes.ok) {
        const scheduleData = await scheduleRes.json()
        const schedules = scheduleData.data || scheduleData || []
        
        const roomDesc = resource.description?.toLowerCase() || ''
        const roomAbbrev = resource.abbreviation?.toLowerCase() || ''
        const roomNumber = (resource.description || '').match(/^\d+/)?.[0] || ''
        
        const seenKeys = new Set<string>()
        
        for (const schedule of schedules) {
          const scheduleRoomDesc = (schedule.room?.description || '').toLowerCase().trim()
          const scheduleRoomAbbrev = (schedule.room?.abbreviation || '').toLowerCase().trim()
          const scheduleRoomNumber = (schedule.room?.description || '').match(/^\d+/)?.[0] || ''
          
          // Skip classes with no room assigned
          if (!scheduleRoomDesc || scheduleRoomDesc === '<none specified>' || scheduleRoomDesc === 'none') continue
          
          // Match room - require non-empty strings on both sides
          let matches = false
          if (roomNumber && scheduleRoomNumber && roomNumber === scheduleRoomNumber) matches = true
          else if (roomDesc && scheduleRoomDesc && scheduleRoomDesc.length > 2 && (scheduleRoomDesc.includes(roomDesc) || roomDesc.includes(scheduleRoomDesc))) matches = true
          else if (roomAbbrev && scheduleRoomAbbrev && scheduleRoomAbbrev.length > 1 && (scheduleRoomAbbrev.includes(roomAbbrev) || roomAbbrev.includes(scheduleRoomAbbrev))) matches = true
          
          if (!matches) continue
          
          // Check day pattern
          const dayPattern = schedule.day?.description || schedule.day?.abbreviation || ''
          if (!patternIncludesDay(dayPattern, dayOfWeek)) continue
          
          // Dedupe
          const key = `${schedule.class_id || schedule.internal_class_id}-${scheduleRoomDesc}`
          if (seenKeys.has(key)) continue
          seenKeys.add(key)
          
          const classId = schedule.class_id || String(schedule.internal_class_id) || ''
          const className = classNamesMap[classId] || schedule.block?.description || 'Class'
          
          // Skip archived/old classes
          if (className.toLowerCase().includes(' old') || className.toLowerCase().endsWith(' old')) continue
          
          events.push({
            id: `class-${schedule.id}`,
            title: className,
            startTime: normalizeTime(schedule.start_time),
            endTime: normalizeTime(schedule.end_time),
            allDay: false,
            type: 'class'
          })
        }
      }
    } catch (err) {
      console.warn('Class schedule fetch failed:', err)
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
      if (!a.startTime || !b.startTime) return 0
      return a.startTime.localeCompare(b.startTime)
    })
    
    return NextResponse.json({
      resource: {
        id: resourceId,
        description: resource.description,
        abbreviation: resource.abbreviation
      },
      date,
      events
    })
    
  } catch (error: any) {
    console.error('Resource calendar error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
