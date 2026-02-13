import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query || query.length < 2) {
    return NextResponse.json({ data: [] })
  }

  try {
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('staff')
      .select('person_id, first_name, last_name, email')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .order('last_name')
      .limit(10)

    if (error) {
      console.error('Staff search error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data: data || [] })
  } catch (error: any) {
    console.error('Staff search error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
