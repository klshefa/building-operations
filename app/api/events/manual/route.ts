import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, extractEventAuditFields } from '@/lib/audit'
import { Resend } from 'resend'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const resend = new Resend(process.env.RESEND_API_KEY)

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
      resource_id,
      event_type,
      general_notes,
      needs_program_director,
      needs_office,
      needs_it,
      needs_security,
      needs_facilities,
      // Self-service specific fields
      requested_by,
      requested_at,
      veracross_reservation_id,
      status,
      created_by 
    } = body

    if (!title || !start_date) {
      return NextResponse.json(
        { error: 'Title and date are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    
    // Check if this is a self-service request
    const isSelfService = !!requested_by

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
        resource_id,
        event_type: event_type || 'other',
        general_notes,
        primary_source: 'manual',
        sources: ['manual'],
        source_events: [],
        is_hidden: false,
        has_conflict: false,
        conflict_ok: false,
        needs_program_director: needs_program_director || false,
        needs_office: needs_office || false,
        needs_it: needs_it || false,
        needs_security: needs_security || false,
        needs_facilities: needs_facilities || false,
        food_served: false,
        building_open: false,
        created_by: created_by || requested_by,
        // Self-service fields
        requested_by,
        requested_at,
        veracross_reservation_id,
        status: status || 'active',
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

    // Audit log
    await logAudit({
      entityType: 'ops_events',
      entityId: data.id,
      action: 'CREATE',
      userEmail: created_by || requested_by,
      newValues: extractEventAuditFields(data),
      apiRoute: '/api/events/manual',
      httpMethod: 'POST',
    })

    // Send email notifications for self-service requests
    if (isSelfService && process.env.RESEND_API_KEY) {
      // Get staff name
      const { data: staffInfo } = await supabase
        .from('staff')
        .select('first_name, last_name')
        .ilike('email', requested_by)
        .single()
      
      const staffName = staffInfo 
        ? `${staffInfo.first_name} ${staffInfo.last_name}`
        : requested_by

      // Send confirmation to requester
      try {
        await resend.emails.send({
          from: 'ops@shefaschool.org',
          to: requested_by,
          subject: `Reservation Confirmed: ${title}`,
          html: `
            <h2>Your Reservation is Confirmed!</h2>
            <p>Hi ${staffInfo?.first_name || 'there'},</p>
            <p>Your resource reservation has been successfully created.</p>
            
            <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
              <p><strong>Event:</strong> ${title}</p>
              <p><strong>Date:</strong> ${start_date}</p>
              <p><strong>Time:</strong> ${start_time} - ${end_time}</p>
              <p><strong>Location:</strong> ${location || 'TBD'}</p>
            </div>
            
            <p>You can view or edit your event (simple fields only) at:</p>
            <p><a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://building-operations.vercel.app'}/request/event/${data.id}">View My Event</a></p>
            
            <p style="margin-top: 24px; font-size: 12px; color: #666;">
              Need to change the date, time, or location? Please contact the operations team.
            </p>
          `
        })
      } catch (emailError) {
        console.warn('Failed to send requester email:', emailError)
      }

      // Notify teams if assigned
      const teamEmails: string[] = []
      if (needs_program_director) teamEmails.push('ops@shefaschool.org') // placeholder
      if (needs_office) teamEmails.push('ops@shefaschool.org')
      if (needs_it) teamEmails.push('ops@shefaschool.org')
      if (needs_security) teamEmails.push('ops@shefaschool.org')
      if (needs_facilities) teamEmails.push('ops@shefaschool.org')

      // Send single notification to ops team
      if (teamEmails.length > 0) {
        try {
          await resend.emails.send({
            from: 'ops@shefaschool.org',
            to: 'ops@shefaschool.org',
            subject: `New Event Request: ${title}`,
            html: `
              <h2>New Event Request</h2>
              <p><strong>${staffName}</strong> has submitted a new event request:</p>
              
              <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p><strong>Event:</strong> ${title}</p>
                <p><strong>Date:</strong> ${start_date}</p>
                <p><strong>Time:</strong> ${start_time} - ${end_time}</p>
                <p><strong>Location:</strong> ${location || 'TBD'}</p>
                ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
                ${general_notes ? `<p><strong>Notes:</strong> ${general_notes}</p>` : ''}
              </div>
              
              <p><strong>Teams Requested:</strong></p>
              <ul>
                ${needs_program_director ? '<li>Program Director</li>' : ''}
                ${needs_office ? '<li>Office</li>' : ''}
                ${needs_it ? '<li>IT</li>' : ''}
                ${needs_security ? '<li>Security</li>' : ''}
                ${needs_facilities ? '<li>Facilities</li>' : ''}
              </ul>
              
              <p style="margin-top: 24px;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://building-operations.vercel.app'}/event/${data.id}" 
                   style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px;">
                  View Event Details
                </a>
              </p>
            `
          })
        } catch (emailError) {
          console.warn('Failed to send ops team email:', emailError)
        }
      }
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
