import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role to bypass RLS
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const source = searchParams.get('source')
  const hideHidden = searchParams.get('hideHidden') === 'true'
  
  const supabase = createAdminClient()
  
  let query = supabase
    .from('ops_events')
    .select('*')
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true })
  
  if (startDate) {
    query = query.gte('start_date', startDate)
  }
  if (endDate) {
    query = query.lte('start_date', endDate)
  }
  if (source) {
    query = query.eq('primary_source', source)
  }
  if (hideHidden) {
    query = query.eq('is_hidden', false)
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Error fetching events:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ data })
}
