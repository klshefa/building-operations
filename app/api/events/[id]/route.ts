import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { TeamType, OpsEvent } from '@/lib/types'
import { buildTeamAssignmentEmail, buildEventUpdateEmail, getTeamDisplayName } from '@/lib/notifications'
import { logAudit, getChangedFields, extractEventAuditFields } from '@/lib/audit'

const RESEND_API_KEY = process.env.RESEND_API_KEY

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

async function sendEmail(to: string[], subject: string, html: string) {
  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY not configured')
    return false
  }
  
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Building Operations <ops@shefaschool.org>',
      to,
      subject,
      html
    })
  })
  
  if (!response.ok) {
    const error = await response.text()
    console.error('Email send failed:', error)
    return false
  }
  
  console.log('Email sent to:', to.join(', '))
  return true
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

// All allowed fields for update (whitelist)
const ALLOWED_UPDATE_FIELDS = new Set([
  'title', 'description', 'start_date', 'end_date', 'start_time', 'end_time',
  'all_day', 'location', 'resource_id', 'event_type',
  'expected_attendees', 'food_served', 'food_provider',
  'needs_program_director', 'needs_office', 'needs_it', 'needs_security', 'needs_facilities',
  'program_director_notes', 'office_notes', 'it_notes', 'security_notes', 'facilities_notes',
  'setup_instructions', 'security_personnel_needed', 'building_open', 'elevator_notes',
  'techs_needed', 'av_equipment', 'tech_notes',
  'general_notes', 'is_hidden', 'has_conflict', 'conflict_ok', 'conflict_notes'
])

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
    console.log('PATCH request for event:', id)
    console.log('Body keys:', Object.keys(body))
    
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

    // Remove fields that shouldn't be updated directly and filter to allowed fields only
    const { id: _, created_at, source_events, primary_source, sources, ...rawUpdateData } = body

    // Only include allowed fields (whitelist approach)
    const updateData: Record<string, any> = {}
    for (const [key, value] of Object.entries(rawUpdateData)) {
      if (ALLOWED_UPDATE_FIELDS.has(key)) {
        updateData[key] = value
      }
    }

    // Add updated timestamp
    updateData.updated_at = new Date().toISOString()
    
    console.log('Filtered update data keys:', Object.keys(updateData))
    console.log('Update data:', JSON.stringify(updateData, null, 2))

    const { data, error } = await supabase
      .from('ops_events')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ error: error.message, details: error }, { status: 500 })
    }

    // Audit log
    const oldAuditValues = extractEventAuditFields(currentEvent)
    const newAuditValues = extractEventAuditFields(data)
    const auditChangedFields = getChangedFields(oldAuditValues, newAuditValues)
    
    if (auditChangedFields) {
      await logAudit({
        entityType: 'ops_events',
        entityId: id,
        action: 'UPDATE',
        userEmail: body.updated_by,
        changedFields: auditChangedFields,
        oldValues: oldAuditValues,
        newValues: newAuditValues,
        apiRoute: '/api/events/[id]',
        httpMethod: 'PATCH',
      })
    }

    // Check for newly assigned teams and send notifications
    const newlyAssignedTeams: TeamType[] = []
    for (const [field, team] of Object.entries(TEAM_FIELDS)) {
      if (updateData[field] === true && currentEvent[field] !== true) {
        newlyAssignedTeams.push(team)
      }
    }

    // Send team assignment notifications directly
    for (const team of newlyAssignedTeams) {
      const { data: teamMembers } = await supabase
        .from('ops_users')
        .select('email, name')
        .contains('teams', [team])
        .eq('is_active', true)
      
      if (teamMembers && teamMembers.length > 0) {
        const html = buildTeamAssignmentEmail(data as OpsEvent, team)
        const teamName = getTeamDisplayName(team)
        await sendEmail(
          teamMembers.map(m => m.email),
          `[Ops] ${teamName} Team Assigned: ${data.title}`,
          html
        )
      }
    }

    // Detect changes for subscriber notifications
    const changes: string[] = []
    for (const [field, label] of Object.entries(TRACKED_FIELDS)) {
      if (field in updateData && updateData[field] !== currentEvent[field]) {
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

    // Send update notifications to subscribers directly
    if (changes.length > 0) {
      const { data: subscribers } = await supabase
        .from('event_subscriptions')
        .select('user_email, user_name')
        .eq('event_id', id)
      
      if (subscribers && subscribers.length > 0) {
        console.log('Sending update notifications to:', subscribers.map(s => s.user_email))
        for (const sub of subscribers) {
          const html = buildEventUpdateEmail(data as OpsEvent, changes, sub.user_name || undefined)
          await sendEmail(
            [sub.user_email],
            `[Ops] Event Updated: ${data.title}`,
            html
          )
        }
      }
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
