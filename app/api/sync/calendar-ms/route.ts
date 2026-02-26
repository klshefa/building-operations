import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { format, parseISO } from 'date-fns'

function toEasternTime(d: Date): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }))
}

const CALENDAR_ID = 'c_vk1n1cdvov22evuq77t4cehn68@group.calendar.google.com'
const SOURCE_NAME = 'calendar_ms'

function getGoogleAuth() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!credentials) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  }
  
  const parsed = JSON.parse(credentials)
  const auth = new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  })
  
  return auth
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getCurrentSchoolYear(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (month >= 8) {
    return { start: `${year}-08-01`, end: `${year + 1}-07-31` }
  } else {
    return { start: `${year - 1}-08-01`, end: `${year}-07-31` }
  }
}

export async function POST(request: Request) {
  const startTime = Date.now()
  const schoolYear = getCurrentSchoolYear()
  const today = new Date()

  try {
    const auth = getGoogleAuth()
    const calendar = google.calendar({ version: 'v3', auth })
    const supabase = getSupabaseClient()

    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: today.toISOString(),
      timeMax: new Date(schoolYear.end).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 500,
    })

    const events = response.data.items || []
    console.log(`Fetched ${events.length} events from Middle School Calendar`)

    if (events.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No calendar events to sync',
        records: 0,
        duration_ms: Date.now() - startTime
      })
    }

    const rawEvents = events.map(event => {
      let startDate: string
      let startTime: string | null = null
      let endTime: string | null = null
      
      if (event.start?.dateTime) {
        const parsed = toEasternTime(parseISO(event.start.dateTime))
        startDate = format(parsed, 'yyyy-MM-dd')
        startTime = format(parsed, 'h:mm a')
      } else if (event.start?.date) {
        startDate = event.start.date
      } else {
        startDate = format(today, 'yyyy-MM-dd')
      }
      
      if (event.end?.dateTime) {
        endTime = format(toEasternTime(parseISO(event.end.dateTime)), 'h:mm a')
      }

      return {
        source: SOURCE_NAME,
        source_id: event.id!,
        title: event.summary || 'Untitled Event',
        description: event.description || null,
        start_date: startDate,
        end_date: event.end?.date || startDate,
        start_time: startTime,
        end_time: endTime,
        location: event.location || null,
        resource: null,
        contact_person: event.creator?.email || null,
        raw_data: {
          id: event.id,
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: event.start,
          end: event.end,
          creator: event.creator,
          organizer: event.organizer,
          recurringEventId: event.recurringEventId,
        },
        synced_at: new Date().toISOString()
      }
    })

    const { error } = await supabase
      .from('ops_raw_events')
      .upsert(rawEvents, { onConflict: 'source,source_id' })

    if (error) throw error

    await supabase
      .from('ops_calendar_sync')
      .update({
        last_sync: new Date().toISOString(),
        error_count: 0,
        last_error: null,
        updated_at: new Date().toISOString()
      })
      .eq('calendar_id', CALENDAR_ID)

    await supabase.from('ops_sync_log').insert({
      source: SOURCE_NAME,
      events_synced: rawEvents.length,
      status: 'completed',
      completed_at: new Date().toISOString()
    })

    // Trigger aggregation so ops_events gets the updated times
    const url = new URL(request.url)
    const baseUrl = `${url.protocol}//${url.host}`
    try {
      await fetch(`${baseUrl}/api/aggregate-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      console.warn('Post-sync aggregation failed:', e)
    }

    return NextResponse.json({
      success: true,
      message: `Synced ${rawEvents.length} MS calendar events`,
      records: rawEvents.length,
      duration_ms: Date.now() - startTime
    })

  } catch (error: any) {
    console.error('Calendar sync error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Calendar sync failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 })
  }
}
