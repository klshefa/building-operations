import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// DELETE: Remove a match (unlink events)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; rawEventId: string }> }
) {
  const { id, rawEventId } = await params
  
  try {
    const supabase = createAdminClient()
    
    // Get the match info before deleting (for response message)
    const { data: match } = await supabase
      .from('ops_event_matches')
      .select(`
        match_type,
        ops_raw_events (title)
      `)
      .eq('event_id', id)
      .eq('raw_event_id', rawEventId)
      .single()
    
    if (!match) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 })
    }
    
    // Delete the match
    const { error: deleteError } = await supabase
      .from('ops_event_matches')
      .delete()
      .eq('event_id', id)
      .eq('raw_event_id', rawEventId)
    
    if (deleteError) {
      console.error('Error deleting match:', deleteError)
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }
    
    const rawEventTitle = (match.ops_raw_events as any)?.title || 'event'
    
    return NextResponse.json({
      success: true,
      message: `Unlinked "${rawEventTitle}" from event`,
      was_manual: match.match_type === 'manual'
    })
    
  } catch (error: any) {
    console.error('Error deleting match:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
