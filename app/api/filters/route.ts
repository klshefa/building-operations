import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role to bypass RLS
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Ensure the table exists by trying to create it via RPC
async function ensureTableExists(supabase: ReturnType<typeof createAdminClient>) {
  // Try to select from the table - if it doesn't exist, we'll get a specific error
  const { error } = await supabase.from('ops_event_filters').select('id').limit(1)
  
  if (error && (error.code === 'PGRST116' || error.code === 'PGRST205' || error.message.includes('does not exist'))) {
    console.log('ops_event_filters table does not exist, attempting to create via RPC...')
    // Table doesn't exist - we need to create it manually via SQL Editor
    // Return a flag indicating the table needs to be created
    return false
  }
  return true
}

// GET - List all filters
export async function GET() {
  const supabase = createAdminClient()
  
  const tableExists = await ensureTableExists(supabase)
  if (!tableExists) {
    // Return empty array but with a flag indicating table needs creation
    return NextResponse.json({ 
      data: [], 
      tableExists: false,
      message: 'The ops_event_filters table does not exist. Please run the migration SQL in Supabase SQL Editor.'
    })
  }
  
  const { data, error } = await supabase
    .from('ops_event_filters')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('Error fetching filters:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ data, tableExists: true })
}

// POST - Create a new filter
export async function POST(request: Request) {
  const supabase = createAdminClient()
  
  try {
    const body = await request.json()
    const { name, filter_type, filter_value, case_sensitive, created_by } = body
    
    if (!name || !filter_type || !filter_value) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from('ops_event_filters')
      .insert({
        name,
        filter_type,
        filter_value,
        case_sensitive: case_sensitive || false,
        created_by
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating filter:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT - Update a filter
export async function PUT(request: Request) {
  const supabase = createAdminClient()
  
  try {
    const body = await request.json()
    const { id, ...updates } = body
    
    if (!id) {
      return NextResponse.json({ error: 'Missing filter ID' }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from('ops_event_filters')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      console.error('Error updating filter:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// DELETE - Remove a filter
export async function DELETE(request: Request) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  
  if (!id) {
    return NextResponse.json({ error: 'Missing filter ID' }, { status: 400 })
  }
  
  const { error } = await supabase
    .from('ops_event_filters')
    .delete()
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting filter:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  
  return NextResponse.json({ success: true })
}
