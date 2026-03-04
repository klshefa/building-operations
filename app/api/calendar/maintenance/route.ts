import { NextRequest, NextResponse } from 'next/server'
import { google, calendar_v3 } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { parse, format } from 'date-fns'
import { GOOGLE_CALENDARS } from '@/lib/calendar-config'
import { logAudit } from '@/lib/audit'

const MAINTENANCE_CAL = GOOGLE_CALENDARS.find(c => c.source === 'calendar_maintenance')!

function getGoogleAuthForWrite() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!credentials) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  }
  const parsed = JSON.parse(credentials)
  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  })
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Parse portal time string ("3:00 PM") + date ("2026-03-04") into ISO 8601.
 * Returns null if the time string is missing or unparseable.
 */
function buildDateTimeISO(dateStr: string, timeStr: string | null | undefined): string | null {
  if (!timeStr) return null
  try {
    const combined = `${dateStr} ${timeStr}`
    const parsed = parse(combined, 'yyyy-MM-dd h:mm a', new Date())
    if (isNaN(parsed.getTime())) return null
    return format(parsed, "yyyy-MM-dd'T'HH:mm:ss")
  } catch {
    return null
  }
}

function normalizeLocation(loc: string | null | undefined): string {
  return (loc || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Parse a Google Calendar event's start time into minutes-since-midnight
 * for ±window comparison.
 */
function googleEventStartMinutes(event: calendar_v3.Schema$Event): number | null {
  if (!event.start?.dateTime) return null
  const d = new Date(event.start.dateTime)
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Parse portal time string ("3:00 PM") into minutes-since-midnight.
 */
function portalTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  try {
    const parsed = parse(timeStr, 'h:mm a', new Date())
    if (isNaN(parsed.getTime())) return null
    return parsed.getHours() * 60 + parsed.getMinutes()
  } catch {
    return null
  }
}

function googleEventHtmlLink(calendarId: string, eventId: string): string {
  return `https://calendar.google.com/calendar/event?eid=${btoa(`${eventId} ${calendarId}`)}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { event_id, mode = 'ensure' } = body as { event_id?: string; mode?: 'check' | 'ensure' }

    if (!event_id) {
      return NextResponse.json({ error: 'event_id is required' }, { status: 400 })
    }
    if (mode !== 'check' && mode !== 'ensure') {
      return NextResponse.json({ error: 'mode must be "check" or "ensure"' }, { status: 400 })
    }

    const supabase = getSupabaseClient()

    const { data: event, error: eventError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', event_id)
      .maybeSingle()

    if (eventError) {
      console.error('Failed to load event:', eventError)
      return NextResponse.json({ error: 'Failed to load event' }, { status: 500 })
    }
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (!event.title || !event.start_date) {
      return NextResponse.json({ error: 'Event missing title or start_date' }, { status: 400 })
    }

    // --- Tier 1: source match ---
    if (event.primary_source === 'calendar_maintenance') {
      return NextResponse.json({ exists: true, match_type: 'source' })
    }

    // --- Tiers 2 & 3: query the Google Calendar ---
    const auth = getGoogleAuthForWrite()
    const calendar = google.calendar({ version: 'v3', auth })

    const eventDate = new Date(event.start_date + 'T00:00:00')
    const dayBefore = new Date(eventDate)
    dayBefore.setDate(dayBefore.getDate() - 1)
    const dayAfter = new Date(eventDate)
    dayAfter.setDate(dayAfter.getDate() + 2)

    const listResponse = await calendar.events.list({
      calendarId: MAINTENANCE_CAL.calendarId,
      timeMin: dayBefore.toISOString(),
      timeMax: dayAfter.toISOString(),
      singleEvents: true,
      maxResults: 100,
    })

    const calEvents = listResponse.data.items || []

    // --- Tier 2: extendedProperties match ---
    const extMatch = calEvents.find(
      e => e.extendedProperties?.private?.portal_event_id === event_id
    )
    if (extMatch) {
      return NextResponse.json({
        exists: true,
        match_type: 'exact',
        google_event_id: extMatch.id,
        htmlLink: extMatch.htmlLink || googleEventHtmlLink(MAINTENANCE_CAL.calendarId, extMatch.id!),
      })
    }

    // --- Tier 3: fuzzy match (same date + location + ±30min) ---
    const portalMinutes = portalTimeToMinutes(event.start_time)
    const portalLocation = normalizeLocation(event.location)
    const TIME_WINDOW_MINUTES = 30

    let fuzzyMatch: calendar_v3.Schema$Event | null = null
    if (portalLocation) {
      for (const ce of calEvents) {
        const ceDate = ce.start?.date || (ce.start?.dateTime ? ce.start.dateTime.substring(0, 10) : null)
        if (ceDate !== event.start_date) continue

        const ceLocation = normalizeLocation(ce.location)
        if (!ceLocation || ceLocation !== portalLocation) continue

        if (portalMinutes !== null) {
          const ceMinutes = googleEventStartMinutes(ce)
          if (ceMinutes !== null && Math.abs(ceMinutes - portalMinutes) > TIME_WINDOW_MINUTES) continue
        }

        fuzzyMatch = ce
        break
      }
    }

    if (fuzzyMatch) {
      return NextResponse.json({
        exists: true,
        match_type: 'fuzzy',
        google_event_id: fuzzyMatch.id,
        htmlLink: fuzzyMatch.htmlLink || googleEventHtmlLink(MAINTENANCE_CAL.calendarId, fuzzyMatch.id!),
      })
    }

    // --- Not found ---
    if (mode === 'check') {
      return NextResponse.json({ exists: false })
    }

    // --- Create the Google Calendar event ---
    const startISO = buildDateTimeISO(event.start_date, event.start_time)
    const endISO = buildDateTimeISO(event.end_date || event.start_date, event.end_time)

    const portalUrl = `https://ops.shefaschool.org/event/${event_id}`

    const calendarEvent: calendar_v3.Schema$Event = {
      summary: event.title,
      description: `Building Ops event: ${portalUrl}`,
      location: event.location || undefined,
      extendedProperties: {
        private: {
          portal_event_id: event_id,
          portal_event_url: portalUrl,
        },
      },
    }

    if (startISO) {
      calendarEvent.start = { dateTime: startISO, timeZone: 'America/New_York' }
      calendarEvent.end = endISO
        ? { dateTime: endISO, timeZone: 'America/New_York' }
        : { dateTime: startISO, timeZone: 'America/New_York' }
    } else {
      calendarEvent.start = { date: event.start_date }
      calendarEvent.end = { date: event.end_date || event.start_date }
    }

    const createResponse = await calendar.events.insert({
      calendarId: MAINTENANCE_CAL.calendarId,
      requestBody: calendarEvent,
    })

    const createdEvent = createResponse.data
    const googleEventId = createdEvent.id!
    const htmlLink = createdEvent.htmlLink || googleEventHtmlLink(MAINTENANCE_CAL.calendarId, googleEventId)

    console.log(`Created maintenance calendar event: ${googleEventId} for portal event ${event_id}`)

    await logAudit({
      entityType: 'ops_events',
      entityId: event_id,
      action: 'CREATE',
      apiRoute: '/api/calendar/maintenance',
      httpMethod: 'POST',
      metadata: {
        target: 'google_calendar_maintenance',
        google_event_id: googleEventId,
        htmlLink,
        event_title: event.title,
        event_date: event.start_date,
      },
    })

    return NextResponse.json({
      created: true,
      google_event_id: googleEventId,
      htmlLink,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Add-to-maintenance-calendar error:', message)

    const isGoogleError = message.includes('calendar') || message.includes('Google') || message.includes('googleapis')
    return NextResponse.json(
      { error: message },
      { status: isGoogleError ? 502 : 500 }
    )
  }
}
