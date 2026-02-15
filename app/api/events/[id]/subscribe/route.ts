import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET - Check if user is subscribed
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    
    if (!email) {
      return NextResponse.json(
        { error: 'email parameter is required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('event_subscriptions')
      .select('id')
      .eq('event_id', id)
      .eq('user_email', email.toLowerCase())
      .maybeSingle()
    
    if (error) {
      console.error('Error checking subscription:', error)
      return NextResponse.json(
        { error: 'Failed to check subscription status' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      subscribed: !!data
    })
    
  } catch (error: any) {
    console.error('Error in GET subscribe:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// POST - Subscribe to event
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { email, name } = await request.json()
    
    if (!email) {
      return NextResponse.json(
        { error: 'email is required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    // Check if event exists
    const { data: event, error: eventError } = await supabase
      .from('ops_events')
      .select('id, title')
      .eq('id', id)
      .single()
    
    if (eventError || !event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      )
    }
    
    // Insert subscription (upsert to handle duplicates gracefully)
    const { data, error } = await supabase
      .from('event_subscriptions')
      .upsert({
        event_id: id,
        user_email: email.toLowerCase(),
        user_name: name || null,
        subscribed_at: new Date().toISOString()
      }, {
        onConflict: 'event_id,user_email'
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating subscription:', error)
      return NextResponse.json(
        { error: 'Failed to subscribe' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      subscribed: true,
      message: `Subscribed to "${event.title}"`
    })
    
  } catch (error: any) {
    console.error('Error in POST subscribe:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

// DELETE - Unsubscribe from event
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    
    if (!email) {
      return NextResponse.json(
        { error: 'email parameter is required' },
        { status: 400 }
      )
    }
    
    const supabase = createAdminClient()
    
    const { error } = await supabase
      .from('event_subscriptions')
      .delete()
      .eq('event_id', id)
      .eq('user_email', email.toLowerCase())
    
    if (error) {
      console.error('Error removing subscription:', error)
      return NextResponse.json(
        { error: 'Failed to unsubscribe' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      subscribed: false,
      message: 'Unsubscribed from event'
    })
    
  } catch (error: any) {
    console.error('Error in DELETE subscribe:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
