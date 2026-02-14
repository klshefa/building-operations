import { NextResponse } from 'next/server'
import { sendEmail, buildTeamAssignmentEmail, getTeamDisplayName } from '@/lib/notifications'
import type { TeamType, OpsEvent } from '@/lib/types'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

export async function POST(request: Request) {
  // Verify authentication
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const { eventId, team } = await request.json()
    
    if (!eventId || !team) {
      return NextResponse.json(
        { error: 'eventId and team are required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    // Get the event details
    const { data: event, error: eventError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', eventId)
      .single()
    
    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }
    
    // Get team members who should receive notifications
    const { data: teamMembers, error: membersError } = await supabase
      .from('ops_users')
      .select('email, name')
      .contains('teams', [team])
      .eq('is_active', true)
      .eq('notify_on_team_assignment', true)
    
    if (membersError) {
      console.error('Error fetching team members:', membersError)
      return NextResponse.json(
        { error: 'Failed to fetch team members' },
        { status: 500 }
      )
    }
    
    if (!teamMembers || teamMembers.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No team members to notify',
        sentTo: [] 
      })
    }
    
    // Build and send the email
    const html = buildTeamAssignmentEmail(event as OpsEvent, team as TeamType)
    const teamName = getTeamDisplayName(team as TeamType)
    
    const result = await sendEmail({
      to: teamMembers.map(m => ({ email: m.email, name: m.name })),
      subject: `[Ops] ${teamName} Team Assigned: ${event.title}`,
      html
    })
    
    if (!result.success) {
      console.error('Failed to send team notification:', result.error)
      return NextResponse.json(
        { error: `Failed to send notification: ${result.error}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      sentTo: teamMembers.map(m => m.email)
    })
    
  } catch (error: any) {
    console.error('Error in send-team notification:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
