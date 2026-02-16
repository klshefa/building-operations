import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const supabase = getSupabaseClient()
    
    // Map display keys to database source names
    const sourceMap: Record<string, string> = {
      'resources': 'bigquery_resources',
      'group-events': 'bigquery_group',
      'resource-reservations': 'bigquery_resource',
      'calendar-staff': 'calendar_staff',
      'calendar-ls': 'calendar_ls',
      'calendar-ms': 'calendar_ms',
    }
    
    const syncTimes: Record<string, { completed_at: string; events_synced: number }> = {}
    
    for (const [displayKey, dbSource] of Object.entries(sourceMap)) {
      const { data } = await supabase
        .from('ops_sync_log')
        .select('completed_at, events_synced')
        .eq('source', dbSource)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1)
      
      if (data && data.length > 0) {
        syncTimes[displayKey] = data[0]
      }
    }
    
    return NextResponse.json({ success: true, syncTimes })
  } catch (error: any) {
    console.error('Error fetching sync status:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch sync status' },
      { status: 500 }
    )
  }
}
