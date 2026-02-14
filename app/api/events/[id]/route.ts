import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { TeamType } from '@/lib/types'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Team field mapping
const TEAM_FIELDS: Record<string, TeamType> = {
  needs_program_director: 'program_director',
  needs_office: 'office',
  needs_it: 'it',
  needs_security: 'security',
  needs_facilities: 'facilities'
}

// Fields to track for change notifications
const TRACKED_FIELDS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  start_date: 'Date',
  end_date: 'End date',
  start_time: 'Start time',
  end_time: 'End time',
  location: 'Location',
  expected_attendees: 'Expected attendees',
  food_served: 'Food service',
  food_provider: 'Food provider',
  general_notes: 'General notes',
  setup_instructions: 'Setup instructions',
  security_personnel_needed: 'Security personnel',
  techs_needed: 'Techs needed',
  av_equipment: 'AV equipment',
  program_director_notes: 'Program Director notes',
  office_notes: 'Office notes',
  it_notes: 'IT notes',
  security_notes: 'Security notes',
  facilities_notes: 'Facilities notes'
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    // Get current event data for comparison
    const { data: currentEvent, error: fetchError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !currentEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Remove fields that shouldn't be updated directly
    const { id: _, created_at, source_events, primary_source, sources, ...updateData } = body

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('ops_events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Check for newly assigned teams and send notifications
    const newlyAssignedTeams: TeamType[] = []
    for (const [field, team] of Object.entries(TEAM_FIELDS)) {
      if (updateData[field] === true && currentEvent[field] !== true) {
        newlyAssignedTeams.push(team)
      }
    }

    // Send team assignment notifications (fire and forget)
    if (newlyAssignedTeams.length > 0) {
      for (const team of newlyAssignedTeams) {
        fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://ops.shefaschool.org'}/api/notifications/send-team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: id, team })
        }).catch(err => console.error('Failed to send team notification:', err))
      }
    }

    // Detect changes for subscriber notifications
    const changes: string[] = []
    for (const [field, label] of Object.entries(TRACKED_FIELDS)) {
      if (field in updateData && updateData[field] !== currentEvent[field]) {
        // Format the change message
        if (typeof updateData[field] === 'boolean') {
          changes.push(`${label} changed to ${updateData[field] ? 'Yes' : 'No'}`)
        } else if (updateData[field] === null || updateData[field] === '') {
          changes.push(`${label} was cleared`)
        } else {
          changes.push(`${label} was updated`)
        }
      }
    }

    // Also check team assignments for subscriber notifications
    for (const [field, team] of Object.entries(TEAM_FIELDS)) {
      if (field in updateData && updateData[field] !== currentEvent[field]) {
        const teamName = team.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
        changes.push(`${teamName} team ${updateData[field] ? 'assigned' : 'removed'}`)
      }
    }

    // Send update notifications to subscribers (fire and forget)
    if (changes.length > 0) {
      fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://ops.shefaschool.org'}/api/notifications/send-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: id, changes })
      }).catch(err => console.error('Failed to send update notification:', err))
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Event updated successfully',
      data,
      notifications: {
        teamsNotified: newlyAssignedTeams,
        changesDetected: changes
      }
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
