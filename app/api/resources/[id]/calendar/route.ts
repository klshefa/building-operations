import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  resolveResourceId,
  doesReservationMatchResource,
  resolveClassScheduleRoom,
} from '@/lib/utils/resourceResolver'

const VC_API = 'https://api.veracross.com/shefa/v3'
const VC_TOKEN_URL = 'https://accounts.veracross.com/shefa/oauth/token'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getVcToken(scope: string): Promise<string> {
  const res = await fetch(VC_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.VERACROSS_CLIENT_ID!,
      client_secret: process.env.VERACROSS_CLIENT_SECRET!,
      scope,
    }),
  })
  if (!res.ok) throw new Error(`VC token error: ${res.status}`)
  return (await res.json()).access_token
}

async function fetchAllVcPages(url: string, token: string): Promise<any[]> {
  const all: any[] = []
  let page = 1
  while (page <= 20) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'X-Page-Size': '1000',
        'X-Page-Number': String(page),
      },
    })
    if (!res.ok) break
    const data = await res.json()
    const items = data.data || data || []
    all.push(...items)
    if (items.length < 1000) break
    page++
  }
  return all
}

function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null
  const iso = t.match(/T(\d{2}):(\d{2})/)
  if (iso) return parseInt(iso[1]) * 60 + parseInt(iso[2])
  const ampm = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?/i)
  if (ampm) {
    let h = parseInt(ampm[1])
    const m = parseInt(ampm[2])
    if (ampm[3]?.toLowerCase() === 'pm' && h < 12) h += 12
    if (ampm[3]?.toLowerCase() === 'am' && h === 12) h = 0
    return h * 60 + m
  }
  return null
}

function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null
  const iso = t.match(/T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const hm = t.match(/^(\d{1,2}):(\d{2})/)
  if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`
  return null
}

const DAY_MAP: Record<string, number> = {
  sunday: 0, sun: 0, su: 0, u: 0,
  monday: 1, mon: 1, mo: 1, m: 1,
  tuesday: 2, tue: 2, tu: 2, t: 2,
  wednesday: 3, wed: 3, we: 3, w: 3,
  thursday: 4, thu: 4, th: 4, r: 4,
  friday: 5, fri: 5, fr: 5, f: 5,
  saturday: 6, sat: 6, sa: 6,
}

function dayMatchesTarget(dayText: string, targetDay: number): boolean {
  if (!dayText) return false
  const lower = dayText.toLowerCase().trim()
  if (DAY_MAP[lower] === targetDay) return true
  const rangeMatch = lower.match(/^([a-z]+)\s*-\s*([a-z]+)$/)
  if (rangeMatch) {
    const s = DAY_MAP[rangeMatch[1]]
    const e = DAY_MAP[rangeMatch[2]]
    if (s !== undefined && e !== undefined) {
      return s <= e ? (targetDay >= s && targetDay <= e) : (targetDay >= s || targetDay <= e)
    }
  }
  const parts = lower.split(/[^a-z]+/).filter(Boolean)
  return parts.some(p => DAY_MAP[p] === targetDay)
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
    const debug: any = {}

    const { data: resource } = await supabase
      .from('ops_resources')
      .select('description, abbreviation')
      .eq('id', resourceId)
      .single()

    if (!resource) {
      return NextResponse.json({ error: 'Resource not found' }, { status: 404 })
    }

    const vcIdsInOps = new Set<string>()
    const opsTimeSlots: Array<{ start: number; end: number }> = []

    // ─── SOURCE 1: ops_events ───────────────────────────────────

    const { data: directEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, location, status, resource_id, veracross_reservation_id')
      .eq('resource_id', resourceId)
      .eq('start_date', date)
      .eq('is_hidden', false)

    const { data: nullResEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, location, status, veracross_reservation_id')
      .eq('start_date', date)
      .eq('is_hidden', false)
      .is('resource_id', null)

    const locationMatched: any[] = []
    for (const evt of nullResEvents || []) {
      if (!evt.location) continue
      const resolved = await resolveResourceId(evt.location, supabase)
      if (resolved === resourceId) locationMatched.push(evt)
    }

    const allOpsEvents = [...(directEvents || []), ...locationMatched]

    const byVcId = new Map<string, any[]>()
    const noVcId: any[] = []
    for (const evt of allOpsEvents) {
      const vcid = evt.veracross_reservation_id ? String(evt.veracross_reservation_id) : null
      if (vcid) {
        if (!byVcId.has(vcid)) byVcId.set(vcid, [])
        byVcId.get(vcid)!.push(evt)
      } else {
        noVcId.push(evt)
      }
    }

    const mergedOps: any[] = []
    for (const [, group] of byVcId) {
      mergedOps.push(group[0])
    }
    mergedOps.push(...noVcId)

    for (const evt of mergedOps) {
      if (evt.veracross_reservation_id) {
        vcIdsInOps.add(String(evt.veracross_reservation_id))
      }
      const s = timeToMinutes(evt.start_time)
      const e = timeToMinutes(evt.end_time)
      if (s !== null && e !== null) {
        opsTimeSlots.push({ start: s, end: e })
      }
      const title = evt.status === 'cancelled' ? `[CANCELLED] ${evt.title}` : evt.title
      events.push({
        id: evt.id,
        title,
        startTime: evt.start_time,
        endTime: evt.end_time,
        allDay: evt.all_day,
        type: 'reservation',
      })
    }

    debug.opsEvents = {
      direct: directEvents?.length || 0,
      locationMatched: locationMatched.length,
      merged: mergedOps.length,
    }

    // ─── SOURCE 2: Veracross Reservations API ───────────────────

    try {
      const token = await getVcToken('resource_reservations.reservations:list')
      const url = `${VC_API}/resource_reservations/reservations?on_or_after_start_date=${date}&on_or_before_start_date=${date}`
      const reservations = await fetchAllVcPages(url, token)

      let matched = 0
      for (const res of reservations) {
        const vcResId = String(res.resource_reservation_id || res.id)
        if (vcIdsInOps.has(vcResId)) continue

        if (!(await doesReservationMatchResource(res, resourceId, supabase))) continue
        matched++

        const s = timeToMinutes(res.start_time)
        const e = timeToMinutes(res.end_time)
        if (s !== null && e !== null) {
          const isDupe = opsTimeSlots.some(slot => {
            const overlapStart = Math.max(slot.start, s)
            const overlapEnd = Math.min(slot.end, e)
            const overlapMins = Math.max(0, overlapEnd - overlapStart)
            const resDur = e - s
            const slotDur = slot.end - slot.start
            return (resDur > 0 && overlapMins / resDur > 0.8) ||
                   (slotDur > 0 && overlapMins / slotDur > 0.8)
          })
          if (isDupe) continue
        }

        const eventId = `vc-res-${vcResId}`
        events.push({
          id: eventId,
          title: res.notes || res.description || res.name || 'Reservation',
          startTime: normalizeTime(res.start_time),
          endTime: normalizeTime(res.end_time),
          allDay: false,
          type: 'reservation',
          source: 'veracross',
        })
      }

      debug.vcReservations = { total: reservations.length, matched }
    } catch (err: any) {
      debug.vcReservationsError = err?.message
    }

    // ─── SOURCE 3: Veracross Class Schedules API ────────────────

    try {
      const token = await getVcToken('academics.class_schedules:list academics.classes:list')

      const classNames: Record<string, string> = {}
      const allClasses = await fetchAllVcPages(`${VC_API}/academics/classes`, token)
      for (const cls of allClasses) {
        if (cls.id != null) {
          classNames[String(cls.id)] = cls.name || cls.description || cls.course_name || ''
        }
      }

      const schedules = await fetchAllVcPages(`${VC_API}/academics/class_schedules`, token)

      const dateObj = new Date(date + 'T12:00:00')
      const dayOfWeek = dateObj.getDay()
      const seen = new Set<string>()
      let roomMatches = 0
      let dayMatches = 0

      for (const sched of schedules) {
        const roomId = await resolveClassScheduleRoom(sched.room, supabase)
        if (roomId !== resourceId) continue
        roomMatches++

        const dayText = sched.day?.description || sched.day?.abbreviation || ''
        if (!dayMatchesTarget(dayText, dayOfWeek)) continue
        dayMatches++

        const roomDesc = (sched.room?.description || '').toLowerCase()
        const key = `${sched.class_id || sched.internal_class_id}-${roomDesc}`
        if (seen.has(key)) continue
        seen.add(key)

        const intId = sched.internal_class_id != null ? String(sched.internal_class_id) : ''
        const className = classNames[intId] || sched.block?.description || 'Class'

        events.push({
          id: `class-${sched.id}`,
          title: className,
          startTime: normalizeTime(sched.start_time),
          endTime: normalizeTime(sched.end_time),
          allDay: false,
          type: 'class',
        })
      }

      debug.classSchedules = {
        total: schedules.length,
        roomMatches,
        dayMatches,
        classNamesLoaded: Object.keys(classNames).length,
      }
    } catch (err: any) {
      debug.classSchedulesError = err?.message
    }

    // ─── SOURCE 4: School-wide Calendar Events ──────────────────

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
        source: cal.source,
      })
    }

    events.sort((a, b) => {
      if (a.allDay && !b.allDay) return -1
      if (!a.allDay && b.allDay) return 1
      const aMin = timeToMinutes(a.startTime) ?? 9999
      const bMin = timeToMinutes(b.startTime) ?? 9999
      return aMin - bMin
    })

    return NextResponse.json({
      resource: { id: resourceId, description: resource.description, abbreviation: resource.abbreviation },
      date,
      events,
      debug,
    })
  } catch (error: any) {
    console.error('Resource calendar error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
