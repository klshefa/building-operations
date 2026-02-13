import { NextResponse } from 'next/server'
import { BigQuery } from '@google-cloud/bigquery'
import { createClient } from '@supabase/supabase-js'
import { format, parse, eachDayOfInterval, addDays, parseISO, isAfter, isBefore, getDay } from 'date-fns'

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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

// Map day abbreviations to day numbers (0=Sun, 1=Mon, etc)
const dayMap: Record<string, number> = {
  'U': 0, 'Su': 0, 'SU': 0, 'Sun': 0,
  'M': 1, 'Mo': 1, 'MO': 1, 'Mon': 1,
  'T': 2, 'Tu': 2, 'TU': 2, 'Tue': 2,
  'W': 3, 'We': 3, 'WE': 3, 'Wed': 3,
  'R': 4, 'Th': 4, 'TH': 4, 'Thu': 4,
  'F': 5, 'Fr': 5, 'FR': 5, 'Fri': 5,
  'S': 6, 'Sa': 6, 'SA': 6, 'Sat': 6,
}

function expandRecurringDates(startDate: string, endDate: string, daysPattern: string, maxEndDate: Date): Date[] {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const today = new Date()
  
  // Don't expand beyond maxEndDate
  const effectiveEnd = isAfter(end, maxEndDate) ? maxEndDate : end
  
  // Parse days pattern (e.g., "T,R" for Tuesday/Thursday)
  const activeDays = daysPattern.split(',').map(d => dayMap[d.trim()]).filter(d => d !== undefined)
  
  if (activeDays.length === 0) {
    // If no pattern, return single date if in future
    return isAfter(start, today) || format(start, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') 
      ? [start] 
      : []
  }
  
  // Get all days in the interval and filter to active days
  const allDays = eachDayOfInterval({ start, end: effectiveEnd })
  return allDays.filter(day => {
    const dayOfWeek = getDay(day)
    return activeDays.includes(dayOfWeek) && (isAfter(day, today) || format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'))
  })
}

export async function POST(request: Request) {
  const startTime = Date.now()
  const schoolYear = getCurrentSchoolYear()
  const today = format(new Date(), 'yyyy-MM-dd')
  const schoolYearEnd = parseISO(schoolYear.end)

  try {
    const bigquery = getBigQueryClient()
    const supabase = getSupabaseClient()

    // Query BigQuery for resource reservations
    // Note: Use COALESCE for End_Date since single-day reservations may have NULL End_Date
    const query = `
      SELECT
        Description as title,
        Resource as resource,
        Start_Date as start_date,
        End_Date as end_date,
        Start_Time as start_time,
        End_Time as end_time,
        Days as days,
        \`EVENT: Contact Person\` as contact_person,
        Event as event_ref,
        Conflict as has_conflict,
        \`Approval Status\` as approval_status,
        Class_Schedule as is_class
      FROM \`vc_data.resource_reservations\`
      WHERE Start_Date <= @endDate
        AND COALESCE(End_Date, Start_Date) >= @today
    `

    const [rows] = await bigquery.query({
      query,
      params: { today, endDate: schoolYear.end },
      location: 'US'
    })

    console.log(`Fetched ${rows.length} resource reservations from BigQuery`)

    // Helper to extract date value (handles both struct and string formats)
    const getDateValue = (d: any) => {
      if (!d) return null
      if (typeof d === 'string') return d
      if (d.value) return d.value
      return String(d)
    }

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No resource reservations to sync',
        records: 0,
        duration_ms: Date.now() - startTime
      })
    }

    // Process each reservation - expand recurring ones
    const rawEvents: any[] = []
    
    for (const row of rows) {
      // Skip class schedules for now (they clutter the calendar)
      if (row.is_class) continue
      
      const startDateStr = getDateValue(row.start_date)
      const endDateStr = getDateValue(row.end_date) || startDateStr // Default end_date to start_date if null
      
      // Log Keith Test events for debugging
      if (row.title?.toLowerCase().includes('keith')) {
        console.log('Found Keith reservation:', {
          title: row.title,
          startDate: startDateStr,
          endDate: endDateStr,
          days: row.days,
          is_class: row.is_class
        })
      }
      
      let dates: Date[]
      if (row.days) {
        dates = expandRecurringDates(startDateStr, endDateStr, row.days, schoolYearEnd)
        if (row.title?.toLowerCase().includes('keith')) {
          console.log('Keith expanded dates:', dates.map(d => format(d, 'yyyy-MM-dd')))
        }
      } else {
        dates = [parseISO(startDateStr)]
      }

      for (const date of dates) {
        const dateStr = format(date, 'yyyy-MM-dd')
        
        // Create unique source_id combining title, resource, and date
        const sourceId = `${row.title}-${row.resource}-${dateStr}`.replace(/\s+/g, '-').toLowerCase()
        
        rawEvents.push({
          source: 'bigquery_resource',
          source_id: sourceId,
          title: row.title || `Resource: ${row.resource}`,
          description: row.event_ref !== 'None' ? `Related event: ${row.event_ref}` : null,
          start_date: dateStr,
          end_date: dateStr,
          start_time: row.start_time,
          end_time: row.end_time,
          location: null,
          resource: row.resource,
          contact_person: row.contact_person === 'None' ? null : row.contact_person,
          recurring_pattern: row.days || null,
          raw_data: { ...row, expanded_date: dateStr },
          synced_at: new Date().toISOString()
        })
      }
    }

    console.log(`Expanded to ${rawEvents.length} individual reservation events`)

    // Deduplicate by source_id before inserting
    const uniqueEvents = new Map<string, any>()
    for (const event of rawEvents) {
      uniqueEvents.set(event.source_id, event)
    }
    const dedupedEvents = Array.from(uniqueEvents.values())
    console.log(`Deduped from ${rawEvents.length} to ${dedupedEvents.length} events`)

    // Upsert in batches
    const batchSize = 100
    let insertedCount = 0

    for (let i = 0; i < dedupedEvents.length; i += batchSize) {
      const batch = dedupedEvents.slice(i, i + batchSize)
      const { error } = await supabase
        .from('ops_raw_events')
        .upsert(batch, { onConflict: 'source,source_id' })

      if (error) {
        console.error('Batch upsert error:', error)
        throw error
      }
      insertedCount += batch.length
    }

    // Log sync
    await supabase.from('ops_sync_log').insert({
      source: 'bigquery_resource',
      events_synced: insertedCount,
      status: 'completed',
      completed_at: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      message: `Synced ${insertedCount} resource reservations`,
      records: insertedCount,
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
