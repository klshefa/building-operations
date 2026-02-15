import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getResendClient() {
  return new Resend(process.env.RESEND_API_KEY)
}

// GET /api/user-events?email=user@shefaschool.org
// Returns the user's upcoming events
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    const today = new Date().toISOString().split('T')[0]
    
    const { data: events, error } = await supabase
      .from('ops_events')
      .select('id, title, description, start_date, start_time, end_time, location, status, requested_at, general_notes')
      .eq('requested_by', email)
      .gte('start_date', today)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (error) {
      console.error('Error fetching user events:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ events: events || [] })
    
  } catch (error: any) {
    console.error('User events API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH /api/user-events
// Update user's event (limited fields only)
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { eventId, email, title, description, general_notes, selectedTeams } = body
    
    if (!eventId || !email) {
      return NextResponse.json({ error: 'eventId and email are required' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    
    // Verify the user owns this event
    const { data: existing, error: fetchError } = await supabase
      .from('ops_events')
      .select('id, requested_by, status')
      .eq('id', eventId)
      .single()
    
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    if (existing.requested_by !== email) {
      return NextResponse.json({ error: 'You can only edit your own events' }, { status: 403 })
    }
    
    if (existing.status === 'cancelled') {
      return NextResponse.json({ error: 'Cannot edit a cancelled event' }, { status: 400 })
    }
    
    // Update only allowed fields
    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (general_notes !== undefined) updateData.general_notes = general_notes
    if (selectedTeams !== undefined) {
      updateData.needs_program_director = selectedTeams.includes('program')
      updateData.needs_office = selectedTeams.includes('office')
      updateData.needs_it = selectedTeams.includes('it')
      updateData.needs_security = selectedTeams.includes('security')
      updateData.needs_facilities = selectedTeams.includes('facilities')
    }
    
    updateData.updated_at = new Date().toISOString()
    
    const { data, error } = await supabase
      .from('ops_events')
      .update(updateData)
      .eq('id', eventId)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating event:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, event: data })
    
  } catch (error: any) {
    console.error('Update event error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/user-events/cancel
// Cancel user's event (marks as cancelled and notifies ops team)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { eventId, email, action } = body
    
    if (action !== 'cancel') {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    
    if (!eventId || !email) {
      return NextResponse.json({ error: 'eventId and email are required' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    
    // Verify the user owns this event
    const { data: existing, error: fetchError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', eventId)
      .single()
    
    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    if (existing.requested_by !== email) {
      return NextResponse.json({ error: 'You can only cancel your own events' }, { status: 403 })
    }
    
    if (existing.status === 'cancelled') {
      return NextResponse.json({ error: 'Event is already cancelled' }, { status: 400 })
    }
    
    // Mark as cancelled
    const { error: updateError } = await supabase
      .from('ops_events')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', eventId)
    
    if (updateError) {
      console.error('Error cancelling event:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    
    // Get staff info for the email
    const { data: staffInfo } = await supabase
      .from('staff')
      .select('first_name, last_name')
      .ilike('email', email)
      .single()
    
    const staffName = staffInfo 
      ? `${staffInfo.first_name} ${staffInfo.last_name}` 
      : email
    
    // Send email notification to ops team
    try {
      await getResendClient().emails.send({
        from: 'ops@shefaschool.org',
        to: 'ops@shefaschool.org',
        subject: `[Action Required] Event Cancellation Request: ${existing.title}`,
        html: `
          <h2>Event Cancellation Request</h2>
          <p><strong>${staffName}</strong> has requested to cancel the following event:</p>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p><strong>Event:</strong> ${existing.title}</p>
            <p><strong>Date:</strong> ${existing.start_date}</p>
            <p><strong>Time:</strong> ${existing.start_time} - ${existing.end_time}</p>
            <p><strong>Location:</strong> ${existing.location || 'N/A'}</p>
            ${existing.veracross_reservation_id ? `<p><strong>Veracross Reservation ID:</strong> ${existing.veracross_reservation_id}</p>` : ''}
          </div>
          
          <p><strong>Action Required:</strong> Please delete this reservation in Veracross manually.</p>
          
          <p style="margin-top: 24px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://building-operations.vercel.app'}/event/${eventId}" 
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
              View Event in Ops Portal
            </a>
          </p>
        `
      })
    } catch (emailError) {
      console.warn('Failed to send cancellation email:', emailError)
      // Don't fail the request if email fails
    }
    
    // Audit log
    try {
      await supabase.from('ops_audit_log').insert({
        entity_type: 'ops_events',
        entity_id: eventId,
        action: 'UPDATE',
        user_email: email,
        changed_fields: {
          status: { old: 'active', new: 'cancelled' }
        },
        api_route: '/api/user-events',
        http_method: 'POST',
        metadata: { action: 'cancel', veracross_reservation_id: existing.veracross_reservation_id }
      })
    } catch (err) {
      console.warn('Audit log failed:', err)
    }
    
    return NextResponse.json({ success: true })
    
  } catch (error: any) {
    console.error('Cancel event error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
