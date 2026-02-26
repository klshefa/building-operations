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

function fmtTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  const ap = h >= 12 ? 'pm' : 'am'
  const hr = h > 12 ? h - 12 : h === 0 ? 12 : h
  return m === 0 ? `${hr}${ap}` : `${hr}:${String(m).padStart(2, '0')}${ap}`
}

function normalizeTime(t: string | null | undefined): string | null {
  if (!t) return null
  const iso = t.match(/T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const hm = t.match(/^(\d{1,2}):(\d{2})/)
  if (hm) return t
  return null
}

function timesOverlap(s1: number, e1: number, s2: number, e2: number): boolean {
  return s1 < e2 && e1 > s2
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
  const parts = lower.split(/[^a-z]+/).filter(Boolean)
  return parts.some(p => DAY_MAP[p] === targetDay)
}

function titlesSimilar(a: string, b: string): boolean {
  const na = a.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
  const nb = b.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  return false
}

interface Conflict {
  type: 'conflict' | 'warning'
  title: string
  startTime: string
  endTime: string
  message: string
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const resourceId = searchParams.get('resourceId')
    const date = searchParams.get('date')
    const startTime = searchParams.get('startTime')
    const endTime = searchParams.get('endTime')
    const excludeEventId = searchParams.get('excludeEventId')
    const excludeEventName = searchParams.get('excludeEventName')

    if (!resourceId || !date || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'resourceId, date, startTime, and endTime are required' },
        { status: 400 }
      )
    }

    const reqStart = timeToMinutes(startTime)
    const reqEnd = timeToMinutes(endTime)
    if (reqStart === null || reqEnd === null) {
      return NextResponse.json({ error: 'Invalid time format' }, { status: 400 })
    }

    const targetId = parseInt(resourceId)
    const supabase = createAdminClient()
    const conflicts: Conflict[] = []
    const warnings: Conflict[] = []
    const debug: any = {}

    const { data: resource } = await supabase
      .from('ops_resources')
      .select('description, abbreviation')
      .eq('id', targetId)
      .single()

    const vcIdsInOps = new Set<string>()

    // ─── SOURCE 1: ops_events ───────────────────────────────────

    const { data: directEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, status, location, veracross_reservation_id')
      .eq('resource_id', targetId)
      .eq('start_date', date)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')

    const { data: nullResEvents } = await supabase
      .from('ops_events')
      .select('id, title, start_time, end_time, all_day, status, location, veracross_reservation_id')
      .eq('start_date', date)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')
      .is('resource_id', null)

    const locationMatched: any[] = []
    for (const evt of nullResEvents || []) {
      if (!evt.location) continue
      const resolved = await resolveResourceId(evt.location, supabase)
      if (resolved === targetId) locationMatched.push(evt)
    }

    const allOpsEvents = [...(directEvents || []), ...locationMatched]

    for (const evt of allOpsEvents) {
      if (evt.veracross_reservation_id) {
        vcIdsInOps.add(String(evt.veracross_reservation_id))
      }
    }

    for (const evt of allOpsEvents) {
      if (excludeEventId && evt.id === excludeEventId) continue
      if (excludeEventName && titlesSimilar(evt.title, excludeEventName)) continue

      if (evt.all_day) {
        conflicts.push({
          type: 'conflict',
          title: evt.title,
          startTime: 'All day',
          endTime: '',
          message: `❌ Conflict: ${evt.title} (All day event)`,
        })
        continue
      }

      const s = timeToMinutes(evt.start_time)
      const e = timeToMinutes(evt.end_time)
      if (s === null || e === null) continue

      if (timesOverlap(reqStart, reqEnd, s, e)) {
        conflicts.push({
          type: 'conflict',
          title: evt.title,
          startTime: evt.start_time || '',
          endTime: evt.end_time || '',
          message: `❌ Conflict: ${evt.title} (${fmtTime(s)}-${fmtTime(e)})`,
        })
      }
    }

    debug.opsEvents = {
      direct: directEvents?.length || 0,
      locationMatched: locationMatched.length,
    }

    // ─── SOURCE 2: Veracross Reservations API ───────────────────

    try {
      const token = await getVcToken('resource_reservations.reservations:list')
      const url = `${VC_API}/resource_reservations/reservations?on_or_after_start_date=${date}&on_or_before_start_date=${date}`
      const reservations = await fetchAllVcPages(url, token)

      let matched = 0
      for (const res of reservations) {
        const resId = String(res.resource_reservation_id || res.id)
        if (vcIdsInOps.has(resId)) continue

        if (!(await doesReservationMatchResource(res, targetId, supabase))) continue
        matched++

        const title = res.notes || res.description || res.name || 'Veracross Reservation'
        if (excludeEventName && titlesSimilar(title, excludeEventName)) continue

        const s = timeToMinutes(res.start_time)
        const e = timeToMinutes(res.end_time)
        if (s === null || e === null) continue

        if (timesOverlap(reqStart, reqEnd, s, e)) {
          conflicts.push({
            type: 'conflict',
            title,
            startTime: res.start_time || '',
            endTime: res.end_time || '',
            message: `❌ Conflict: ${title} (${fmtTime(s)}-${fmtTime(e)})`,
          })
        }
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
      let timeConflicts = 0

      for (const sched of schedules) {
        const roomId = await resolveClassScheduleRoom(sched.room, supabase)
        if (roomId !== targetId) continue
        roomMatches++

        const dayText = sched.day?.description || sched.day?.abbreviation || ''
        if (!dayMatchesTarget(dayText, dayOfWeek)) continue
        dayMatches++

        const roomDesc = (sched.room?.description || '').toLowerCase()
        const key = `${sched.class_id || sched.internal_class_id}-${roomDesc}`
        if (seen.has(key)) continue
        seen.add(key)

        const s = timeToMinutes(sched.start_time)
        const e = timeToMinutes(sched.end_time)
        if (s === null || e === null) continue

        const intId = sched.internal_class_id != null ? String(sched.internal_class_id) : ''
        const className = classNames[intId] || sched.block?.description || 'Class'

        if (timesOverlap(reqStart, reqEnd, s, e)) {
          timeConflicts++
          conflicts.push({
            type: 'conflict',
            title: className,
            startTime: normalizeTime(sched.start_time) || '',
            endTime: normalizeTime(sched.end_time) || '',
            message: `❌ Conflict: ${className} (${fmtTime(s)}-${fmtTime(e)})`,
          })
        }
      }

      debug.classSchedules = {
        total: schedules.length,
        roomMatches,
        dayMatches,
        timeConflicts,
        classNamesLoaded: Object.keys(classNames).length,
      }
    } catch (err: any) {
      debug.classSchedulesError = err?.message
    }

    return NextResponse.json({
      available: conflicts.length === 0,
      conflicts,
      warnings,
      debug,
    })
  } catch (error: any) {
    console.error('Availability check error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
