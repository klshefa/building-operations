import { NextResponse } from 'next/server'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

// DELETE: Remove a match (unlink events)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; rawEventId: string }> }
) {
  // Verify authentication
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

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
