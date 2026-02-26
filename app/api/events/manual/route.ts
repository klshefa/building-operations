import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, extractEventAuditFields, getChangedFields } from '@/lib/audit'
import { sendEmail, buildNewEventEmail } from '@/lib/notifications'
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
      expected_attendees,
      food_served,
      // Team notes
      program_director_notes,
      office_notes,
      it_notes,
      security_notes,
      facilities_notes,
      // IT extra fields
      techs_needed,
      assigned_techs,
      av_equipment,
      tech_notes,
      // Security extra fields
      security_personnel_needed,
      building_open,
      elevator_notes,
      // Facilities extra fields
      setup_instructions,
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

    const vcReservationId = veracross_reservation_id ? String(veracross_reservation_id) : null

    // If this manual entry corresponds to a Veracross reservation, update the existing ops_event
    // instead of creating a duplicate manual row.
    let data: any = null
    let createdNew = false

    if (vcReservationId) {
      const { data: existing } = await supabase
        .from('ops_events')
        .select('*')
        .eq('veracross_reservation_id', vcReservationId)
        .maybeSingle()

      if (existing) {
        const updatePayload: Record<string, any> = {
          title: title || existing.title,
          description: description ?? existing.description,
          event_type: event_type || existing.event_type || 'other',
          general_notes: general_notes ?? existing.general_notes,
          needs_program_director: needs_program_director ?? existing.needs_program_director ?? false,
          needs_office: needs_office ?? existing.needs_office ?? false,
          needs_it: needs_it ?? existing.needs_it ?? false,
          needs_security: needs_security ?? existing.needs_security ?? false,
          needs_facilities: needs_facilities ?? existing.needs_facilities ?? false,
          expected_attendees: expected_attendees ?? existing.expected_attendees ?? null,
          food_served: food_served ?? existing.food_served ?? false,
          // Team notes
          program_director_notes: program_director_notes ?? existing.program_director_notes ?? null,
          office_notes: office_notes ?? existing.office_notes ?? null,
          it_notes: it_notes ?? existing.it_notes ?? null,
          security_notes: security_notes ?? existing.security_notes ?? null,
          facilities_notes: facilities_notes ?? existing.facilities_notes ?? null,
          // IT extra fields
          techs_needed: techs_needed ?? existing.techs_needed ?? null,
          assigned_techs: assigned_techs ?? existing.assigned_techs ?? null,
          av_equipment: av_equipment ?? existing.av_equipment ?? null,
          tech_notes: tech_notes ?? existing.tech_notes ?? null,
          // Security extra fields
          security_personnel_needed: security_personnel_needed ?? existing.security_personnel_needed ?? null,
          building_open: building_open ?? existing.building_open ?? false,
          elevator_notes: elevator_notes ?? existing.elevator_notes ?? null,
          // Facilities extra fields
          setup_instructions: setup_instructions ?? existing.setup_instructions ?? null,
          // Self-service fields
          requested_by: requested_by ?? existing.requested_by,
          requested_at: requested_at ?? existing.requested_at,
          status: status ?? existing.status ?? 'active',
          updated_by: created_by || requested_by || existing.updated_by,
          updated_at: new Date().toISOString(),
        }

        // Only backfill core fields if missing on the existing record.
        if (location && !existing.location) updatePayload.location = location
        if (resource_id && !existing.resource_id) updatePayload.resource_id = resource_id
        if (start_date && !existing.start_date) updatePayload.start_date = start_date
        if (end_date && !existing.end_date) updatePayload.end_date = end_date
        if (start_time && !existing.start_time) updatePayload.start_time = start_time
        if (end_time && !existing.end_time) updatePayload.end_time = end_time
        if (all_day != null && existing.all_day == null) updatePayload.all_day = all_day

        const { data: updated, error: updateError } = await supabase
          .from('ops_events')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .single()

        if (updateError) {
          console.error('Error updating existing VC event with manual details:', updateError)
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        data = updated

        // Audit log (UPDATE)
        const oldAuditValues = extractEventAuditFields(existing)
        const newAuditValues = extractEventAuditFields(updated)
        const changedFields = getChangedFields(oldAuditValues, newAuditValues)
        if (changedFields) {
          await logAudit({
            entityType: 'ops_events',
            entityId: updated.id,
            action: 'UPDATE',
            userEmail: created_by || requested_by,
            changedFields,
            oldValues: oldAuditValues,
            newValues: newAuditValues,
            apiRoute: '/api/events/manual',
            httpMethod: 'POST',
            metadata: { upsertedIntoReservation: true, veracross_reservation_id: vcReservationId },
          })
        }
      }
    }

    // Fallback: create the event directly in ops_events with manual source
    if (!data) {
      const { data: inserted, error } = await supabase
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
          expected_attendees: expected_attendees || null,
          food_served: food_served || false,
          // Team notes
          program_director_notes: program_director_notes || null,
          office_notes: office_notes || null,
          it_notes: it_notes || null,
          security_notes: security_notes || null,
          facilities_notes: facilities_notes || null,
          // IT extra fields
          techs_needed: techs_needed || null,
          assigned_techs: assigned_techs || null,
          av_equipment: av_equipment || null,
          tech_notes: tech_notes || null,
          // Security extra fields
          security_personnel_needed: security_personnel_needed || null,
          building_open: building_open || false,
          elevator_notes: elevator_notes || null,
          // Facilities extra fields
          setup_instructions: setup_instructions || null,
          created_by: created_by || requested_by,
          // Self-service fields
          requested_by,
          requested_at,
          veracross_reservation_id: vcReservationId,
          status: status || 'active',
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating manual event:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      data = inserted
      createdNew = true

      // Audit log (CREATE)
      await logAudit({
        entityType: 'ops_events',
        entityId: data.id,
        action: 'CREATE',
        userEmail: created_by || requested_by,
        newValues: extractEventAuditFields(data),
        apiRoute: '/api/events/manual',
        httpMethod: 'POST',
      })
    }

    // Send new-event notification to users with notify_on_new_event enabled
    if (process.env.RESEND_API_KEY) {
      try {
        const { data: recipients } = await supabase
          .from('ops_users')
          .select('email, name')
          .eq('notify_on_new_event', true)
          .eq('is_active', true)

        if (recipients && recipients.length > 0) {
          const creatorEmail = created_by || requested_by
          let creatorName = creatorEmail
          if (creatorEmail) {
            const { data: staffInfo } = await supabase
              .from('staff')
              .select('first_name, last_name')
              .ilike('email', creatorEmail)
              .maybeSingle()
            if (staffInfo) {
              creatorName = `${staffInfo.first_name} ${staffInfo.last_name}`
            }
          }

          const html = buildNewEventEmail(data, creatorName || undefined)
          const result = await sendEmail({
            to: recipients.map(r => ({ email: r.email, name: r.name })),
            subject: `[Ops] New Event: ${data.title}`,
            html,
          })
          if (!result.success) {
            console.warn('[New Event Email] Failed to send:', result.error)
          }
        }
      } catch (emailErr) {
        console.warn('[New Event Email] Error:', emailErr)
      }
    }

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
        await getResendClient().emails.send({
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
          await getResendClient().emails.send({
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
      message: createdNew ? 'Event created successfully' : 'Event updated successfully',
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
