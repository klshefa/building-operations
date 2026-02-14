import { NextResponse } from 'next/server'
import { BigQuery } from '@google-cloud/bigquery'
import { format, parse } from 'date-fns'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

function getBigQueryClient() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (credentials) {
    return new BigQuery({
      credentials: JSON.parse(credentials),
      projectId: JSON.parse(credentials).project_id,
    })
  }
  return new BigQuery()
}

function getSupabaseClient() {
  return createAdminClient()
}

// Get current school year
function getCurrentSchoolYear(): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (month >= 8) {
    return {
      start: `${year}-08-01`,
      end: `${year + 1}-07-31`
    }
  } else {
    return {
      start: `${year - 1}-08-01`,
      end: `${year}-07-31`
    }
  }
}

export async function POST(request: Request) {
  // Verify authentication
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const startTime = Date.now()
  const schoolYear = getCurrentSchoolYear()
  const today = format(new Date(), 'yyyy-MM-dd')

  try {
    const bigquery = getBigQueryClient()
    const supabase = getSupabaseClient()

    // Query BigQuery for group events (current school year, from today forward)
    const query = `
      SELECT
        CAST(Event_ID AS STRING) as source_id,
        Description as title,
        Event_Type as event_type,
        Start_Date as start_date,
        End_Date as end_date,
        Start_Time as start_time,
        End_Time as end_time,
        Location as location,
        Resource as resource,
        Contact_Person as contact_person,
        CAST(Reservtion_ID AS STRING) as reservation_id
      FROM \`vc_data.group_events\`
      WHERE Start_Date >= @today
        AND Start_Date <= @endDate
      ORDER BY Start_Date
    `

    const [rows] = await bigquery.query({
      query,
      params: { today, endDate: schoolYear.end },
      location: 'US'
    })

    console.log(`Fetched ${rows.length} group events from BigQuery`)

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No group events to sync',
        records: 0,
        duration_ms: Date.now() - startTime
      })
    }

    // Helper to extract date value (handles both struct and string formats)
    const getDateValue = (d: any) => {
      if (!d) return null
      if (typeof d === 'string') return d
      if (d.value) return d.value
      return String(d)
    }

    // Helper to extract time value (handles both struct and string formats)
    const getTimeValue = (t: any) => {
      if (!t) return null
      if (typeof t === 'string') return t
      if (t.value) return t.value
      return String(t)
    }

    // Transform to raw events
    const rawEvents = rows.map((row: any) => ({
      source: 'bigquery_group',
      source_id: row.source_id,
      title: row.title || 'Untitled Event',
      description: null,
      start_date: getDateValue(row.start_date),
      end_date: getDateValue(row.end_date),
      start_time: getTimeValue(row.start_time),
      end_time: getTimeValue(row.end_time),
      location: row.location === 'None' ? null : row.location,
      resource: row.resource === 'None' ? null : row.resource,
      contact_person: row.contact_person === 'None' ? null : row.contact_person,
      reservation_id: row.reservation_id || null,
      raw_data: row,
      synced_at: new Date().toISOString()
    }))

    // Upsert raw events
    const { error: rawError } = await supabase
      .from('ops_raw_events')
      .upsert(rawEvents, { onConflict: 'source,source_id' })

    if (rawError) {
      throw rawError
    }

    // Log sync
    await supabase.from('ops_sync_log').insert({
      source: 'bigquery_group',
      events_synced: rawEvents.length,
      status: 'completed',
      completed_at: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: `Synced ${rawEvents.length} group events`,
      records: rawEvents.length,
      duration_ms: Date.now() - startTime
    })

  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 })
  }
}
