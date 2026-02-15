import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/staff/lookup?email=jane@shefaschool.org
// Returns person_id and name for a given email
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get('email')

  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  try {
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('staff')
      .select('person_id, first_name, last_name, email')
      .ilike('email', email)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return NextResponse.json({ 
          error: 'Staff member not found',
          email 
        }, { status: 404 })
      }
      console.error('Staff lookup error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      person_id: data.person_id,
      first_name: data.first_name,
      last_name: data.last_name,
      full_name: `${data.first_name} ${data.last_name}`,
      email: data.email
    })
  } catch (error: any) {
    console.error('Staff lookup error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
