import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, buildEventUpdateEmail } from '@/lib/notifications'
import type { OpsEvent } from '@/lib/types'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(request: Request) {
  try {
    const { eventId, changes } = await request.json()
    
    if (!eventId || !changes || !Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { error: 'eventId and changes array are required' },
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
    
    // Get subscribers for this event
    const { data: subscribers, error: subsError } = await supabase
      .from('event_subscriptions')
      .select('user_email, user_name')
      .eq('event_id', eventId)
    
    if (subsError) {
      console.error('Error fetching subscribers:', subsError)
      return NextResponse.json(
        { error: 'Failed to fetch subscribers' },
        { status: 500 }
      )
    }
    
    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No subscribers to notify',
        sentTo: [] 
      })
    }
    
    console.log('Found subscribers:', subscribers.map(s => s.user_email))
    
    // Filter subscribers who have notifications enabled (default to all if column doesn't exist)
    const { data: activeUsers, error: usersError } = await supabase
      .from('ops_users')
      .select('email')
      .in('email', subscribers.map(s => s.user_email))
      .eq('is_active', true)
    
    // If there's an error or no users found, still try to send to all subscribers
    // (the notification preference column may not exist yet)
    let notifySubscribers = subscribers
    if (!usersError && activeUsers && activeUsers.length > 0) {
      const activeEmails = new Set(activeUsers.map(u => u.email))
      notifySubscribers = subscribers.filter(s => activeEmails.has(s.user_email))
    }
    
    console.log('Notifying subscribers:', notifySubscribers.map(s => s.user_email))
    
    if (notifySubscribers.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No active subscribers to notify',
        sentTo: [] 
      })
    }
    
    // Send individual emails (so we can personalize)
    const results = await Promise.all(
      notifySubscribers.map(async (sub) => {
        const html = buildEventUpdateEmail(event as OpsEvent, changes, sub.user_name || undefined)
        return sendEmail({
          to: [{ email: sub.user_email, name: sub.user_name || undefined }],
          subject: `[Ops] Event Updated: ${event.title}`,
          html
        })
      })
    )
    
    const sent = notifySubscribers.filter((_, i) => results[i].success)
    const failed = notifySubscribers.filter((_, i) => !results[i].success)
    
    if (failed.length > 0) {
      console.error('Some notifications failed:', failed.map(f => f.user_email))
    }
    
    return NextResponse.json({
      success: true,
      sentTo: sent.map(s => s.user_email),
      failed: failed.map(f => f.user_email)
    })
    
  } catch (error: any) {
    console.error('Error in send-update notification:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
