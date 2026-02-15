import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      title, 
      description, 
      start_date, 
      end_date, 
      start_time, 
      end_time, 
      all_day, 
      location,
      created_by 
    } = body

    if (!title || !start_date) {
      return NextResponse.json(
        { error: 'Title and date are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Create the event directly in ops_events with manual source
    const { data, error } = await supabase
      .from('ops_events')
      .insert({
        title,
        description,
        start_date,
        end_date: end_date || start_date,
        start_time,
        end_time,
        all_day: all_day || false,
        location,
        event_type: 'other',
        primary_source: 'manual',
        sources: ['manual'],
        source_events: [],
        is_hidden: false,
        has_conflict: false,
        conflict_ok: false,
        needs_program_director: false,
        needs_office: false,
        needs_it: false,
        needs_security: false,
        needs_facilities: false,
        food_served: false,
        building_open: false,
        created_by,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating manual event:', error)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Event created successfully',
      data 
    })

  } catch (error: any) {
    console.error('Error in manual event creation:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create event' },
      { status: 500 }
    )
  }
}
