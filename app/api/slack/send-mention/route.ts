import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMentionNotification, isSlackConfigured } from '@/lib/slack'
import { format, parseISO } from 'date-fns'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

interface MentionRequest {
  eventId: string
  noteType: 'general' | 'program' | 'office' | 'it' | 'security' | 'facilities'
  noteContent: string
  mentionedEmails: string[]
  mentionedByEmail: string
}

export async function POST(request: Request) {
  try {
    console.log('[Slack Mention API] POST request received')
    
    // Check if Slack is configured
    if (!isSlackConfigured()) {
      console.log('[Slack Mention API] SLACK_BOT_TOKEN not configured')
      return NextResponse.json(
        { error: 'Slack integration not configured - add SLACK_BOT_TOKEN to environment', success: false },
        { status: 503 }
      )
    }

    const body: MentionRequest = await request.json()
    const { eventId, noteType, noteContent, mentionedEmails, mentionedByEmail } = body

    if (!eventId || !mentionedEmails || mentionedEmails.length === 0) {
      return NextResponse.json(
        { error: 'eventId and mentionedEmails are required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('ops_events')
      .select('id, title, start_date, end_date, location, start_time, end_time')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }

    // Get the mentioner's name
    const { data: mentioner } = await supabase
      .from('staff')
      .select('first_name, last_name')
      .ilike('email', mentionedByEmail)
      .single()

    const mentionedByName = mentioner 
      ? `${mentioner.first_name} ${mentioner.last_name}`
      : mentionedByEmail

    // Format event date
    let eventDateStr = ''
    try {
      eventDateStr = format(parseISO(event.start_date), 'EEEE, MMMM d, yyyy')
      if (event.start_time) {
        eventDateStr += ` at ${event.start_time}`
      }
    } catch {
      eventDateStr = event.start_date
    }

    // Build event URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.shefaschool.org'
    const eventUrl = `${baseUrl}/event/${eventId}`

    // Track sent mentions to avoid duplicates (check existing mentions in DB)
    // Note: If table doesn't exist yet, we'll just proceed without duplicate checking
    let alreadyMentioned = new Set<string>()
    let newMentions = mentionedEmails
    
    try {
      const { data: existingMentions, error: mentionsError } = await supabase
        .from('event_mentions')
        .select('mentioned_email')
        .eq('event_id', eventId)
        .eq('note_type', noteType)
        .in('mentioned_email', mentionedEmails)

      if (!mentionsError && existingMentions) {
        alreadyMentioned = new Set(existingMentions.map(m => m.mentioned_email))
        newMentions = mentionedEmails.filter(email => !alreadyMentioned.has(email.toLowerCase()))
      } else if (mentionsError) {
        console.log('[Slack Mention API] event_mentions table may not exist yet:', mentionsError.message)
      }
    } catch (err) {
      console.log('[Slack Mention API] Could not check existing mentions, proceeding anyway')
    }

    if (newMentions.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'All users were already mentioned in this note',
        sent: [],
        alreadyMentioned: mentionedEmails
      })
    }

    // Send notifications to new mentions
    console.log(`[Slack Mention API] Sending to ${newMentions.length} users:`, newMentions)
    
    const results = await Promise.all(
      newMentions.map(async (email) => {
        console.log(`[Slack Mention API] Sending notification to: ${email}`)
        const result = await sendMentionNotification({
          mentionedEmail: email,
          mentionedBy: mentionedByName,
          eventTitle: event.title,
          eventDate: eventDateStr,
          eventLocation: event.location || undefined,
          noteContent,
          eventUrl,
        })
        console.log(`[Slack Mention API] Result for ${email}:`, result)

        // Record the mention in the database (even if Slack failed, to track attempts)
        // Skip if table doesn't exist
        try {
          await supabase
            .from('event_mentions')
            .insert({
              event_id: eventId,
              note_type: noteType,
              mentioned_email: email.toLowerCase(),
              mentioned_by: mentionedByEmail.toLowerCase(),
              slack_sent: result.success,
              created_at: new Date().toISOString(),
            })
        } catch (dbErr) {
          console.log('[Slack Mention API] Could not record mention in DB:', dbErr)
        }

        return {
          email,
          success: result.success,
          error: result.error,
        }
      })
    )

    const sent = results.filter(r => r.success).map(r => r.email)
    const failed = results.filter(r => !r.success)

    return NextResponse.json({
      success: true,
      sent,
      failed: failed.map(f => ({ email: f.email, error: f.error })),
      alreadyMentioned: Array.from(alreadyMentioned),
    })

  } catch (error: any) {
    console.error('[Slack Mention] Error:', error)
    return NextResponse.json(
      { error: error.message, success: false },
      { status: 500 }
    )
  }
}

// GET - Check if a user has been mentioned before (for UI hints)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId')
    const noteType = searchParams.get('noteType')

    if (!eventId) {
      return NextResponse.json(
        { error: 'eventId is required' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    let query = supabase
      .from('event_mentions')
      .select('mentioned_email, mentioned_by, note_type, slack_sent, created_at')
      .eq('event_id', eventId)

    if (noteType) {
      query = query.eq('note_type', noteType)
    }

    const { data: mentions, error } = await query.order('created_at', { ascending: false })

    if (error) {
      console.error('[Slack Mention] Error fetching mentions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch mentions' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      mentions: mentions || [],
      slackConfigured: isSlackConfigured(),
    })

  } catch (error: any) {
    console.error('[Slack Mention] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
