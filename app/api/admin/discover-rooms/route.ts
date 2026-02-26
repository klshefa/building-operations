import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

async function getToken(scope: string): Promise<string> {
  const response = await fetch(VERACROSS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.VERACROSS_CLIENT_ID!,
      client_secret: process.env.VERACROSS_CLIENT_SECRET!,
      scope,
    }),
  })
  if (!response.ok) throw new Error(`Token fetch failed: ${response.status}`)
  const data = await response.json()
  return data.access_token
}

/**
 * GET /api/admin/discover-rooms
 *
 * Fetches all unique room descriptions from the Veracross Class Schedules API
 * and the Reservations API, then checks which ones have aliases in our table
 * and which are MISSING (unresolvable).
 *
 * Also optionally auto-creates aliases for rooms that can be matched by
 * Veracross resource_id (pass ?auto_fix=true).
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const autoFix = searchParams.get('auto_fix') === 'true'
    const supabase = createAdminClient()

    // Load existing aliases
    const { data: aliases } = await supabase
      .from('ops_resource_aliases')
      .select('resource_id, alias_type, alias_value')

    const aliasMap = new Map<string, number>()
    for (const a of aliases || []) {
      aliasMap.set(a.alias_value, a.resource_id)
    }

    // Load ops_resources for ID-based matching
    const { data: resources } = await supabase
      .from('ops_resources')
      .select('id, description, abbreviation')

    const resourceById = new Map<number, any>()
    for (const r of resources || []) {
      resourceById.set(r.id, r)
    }

    const results: {
      classScheduleRooms: any[]
      reservationResources: any[]
      missingAliases: any[]
      autoFixed: any[]
    } = {
      classScheduleRooms: [],
      reservationResources: [],
      missingAliases: [],
      autoFixed: [],
    }

    // --- Discover class schedule rooms ---
    const csToken = await getToken(CLASS_SCHEDULES_SCOPE)
    const uniqueRooms = new Map<string, { room: any; count: number; sampleScheduleId: any }>()
    let totalSchedulesFetched = 0
    let csApiErrors: string[] = []
    let sampleRawSchedule: any = null

    let page = 1
    while (page <= 10) {
      const res = await fetch(`${VERACROSS_API_BASE}/academics/class_schedules`, {
        headers: {
          'Authorization': `Bearer ${csToken}`,
          'Accept': 'application/json',
          'X-Page-Size': '1000',
          'X-Page-Number': String(page),
        },
      })
      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        csApiErrors.push(`Page ${page}: HTTP ${res.status} - ${errText.substring(0, 200)}`)
        break
      }
      const data = await res.json()
      const schedules = data.data || data || []
      if (schedules.length === 0) break
      totalSchedulesFetched += schedules.length
      if (!sampleRawSchedule && schedules.length > 0) {
        sampleRawSchedule = { room: schedules[0].room, day: schedules[0].day, id: schedules[0].id }
      }

      for (const s of schedules) {
        const roomDesc = (s.room?.description || '').trim()
        if (!roomDesc || roomDesc === '<none specified>' || roomDesc === 'none') continue

        const key = roomDesc.toLowerCase()
        const existing = uniqueRooms.get(key)
        if (existing) {
          existing.count++
        } else {
          uniqueRooms.set(key, {
            room: { description: roomDesc, id: s.room?.id, abbreviation: s.room?.abbreviation, name: s.room?.name },
            count: 1,
            sampleScheduleId: s.id,
          })
        }
      }

      if (schedules.length < 1000) break
      page++
    }

    for (const [key, val] of uniqueRooms) {
      const resolved = aliasMap.get(key)
      const entry = {
        roomDescription: val.room.description,
        roomId: val.room.id,
        roomAbbreviation: val.room.abbreviation,
        scheduleCount: val.count,
        resolvedResourceId: resolved ?? null,
        resolvedResourceDesc: resolved ? resourceById.get(resolved)?.description : null,
        status: resolved ? 'MAPPED' : 'MISSING',
      }
      results.classScheduleRooms.push(entry)

      if (!resolved) {
        results.missingAliases.push({
          source: 'class_schedule',
          text: val.room.description,
          roomId: val.room.id,
          roomAbbreviation: val.room.abbreviation,
          scheduleCount: val.count,
        })

        // Auto-fix: if the room has an id that matches an ops_resources.id, create the alias
        if (autoFix && val.room.id != null && resourceById.has(Number(val.room.id))) {
          const rid = Number(val.room.id)
          const { error } = await supabase
            .from('ops_resource_aliases')
            .upsert({
              resource_id: rid,
              alias_type: 'class_schedule_room',
              alias_value: key,
            }, { onConflict: 'alias_type,alias_value' })

          if (!error) {
            results.autoFixed.push({ alias_value: key, resource_id: rid, source: 'class_schedule_room_id' })
            aliasMap.set(key, rid)
          }
        }
      }
    }

    // --- Discover reservation resources ---
    try {
      const resToken = await getToken(RESERVATIONS_SCOPE)
      const today = new Date().toISOString().split('T')[0]
      const resRes = await fetch(
        `${VERACROSS_API_BASE}/resource_reservations/reservations?on_or_after_start_date=${today}`,
        {
          headers: {
            'Authorization': `Bearer ${resToken}`,
            'Accept': 'application/json',
            'X-Page-Size': '200',
          },
        }
      )

      if (resRes.ok) {
        const resData = await resRes.json()
        const reservations = resData.data || resData || []
        const uniqueRes = new Map<number, { description: string; count: number }>()

        for (const r of reservations) {
          const rid = r.resource_id
          if (rid == null) continue
          const existing = uniqueRes.get(rid)
          if (existing) {
            existing.count++
          } else {
            uniqueRes.set(rid, { description: r.resource_description || '', count: 1 })
          }
        }

        for (const [rid, val] of uniqueRes) {
          const resolved = aliasMap.get(String(rid))
          results.reservationResources.push({
            veracrossResourceId: rid,
            description: val.description,
            reservationCount: val.count,
            resolvedResourceId: resolved ?? null,
            status: resolved ? 'MAPPED' : 'MISSING',
          })
        }
      }
    } catch (err: any) {
      results.reservationResources.push({ error: err.message })
    }

    // Sort for readability
    results.classScheduleRooms.sort((a, b) => (a.status === 'MISSING' ? -1 : 1) - (b.status === 'MISSING' ? -1 : 1))
    results.missingAliases.sort((a, b) => b.scheduleCount - a.scheduleCount)

    return NextResponse.json({
      summary: {
        totalClassScheduleRooms: results.classScheduleRooms.length,
        mappedRooms: results.classScheduleRooms.filter(r => r.status === 'MAPPED').length,
        missingRooms: results.classScheduleRooms.filter(r => r.status === 'MISSING').length,
        totalReservationResources: results.reservationResources.length,
        autoFixed: results.autoFixed.length,
      },
      debug: {
        totalSchedulesFetched,
        csApiErrors,
        sampleRawSchedule,
        aliasCount: aliasMap.size,
        resourceCount: resourceById.size,
      },
      ...results,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
