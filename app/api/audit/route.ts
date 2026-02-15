import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET - Fetch audit logs with filtering and pagination
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = (page - 1) * limit
    
    // Filters
    const entityType = searchParams.get('entity_type')
    const entityId = searchParams.get('entity_id')
    const action = searchParams.get('action')
    const userEmail = searchParams.get('user_email')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const search = searchParams.get('search')
    
    const supabase = createAdminClient()
    
    // Build query
    let query = supabase
      .from('ops_audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    // Apply filters
    if (entityType) {
      query = query.eq('entity_type', entityType)
    }
    if (entityId) {
      query = query.eq('entity_id', entityId)
    }
    if (action) {
      query = query.eq('action', action)
    }
    if (userEmail) {
      query = query.ilike('user_email', `%${userEmail}%`)
    }
    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lte('created_at', endDate)
    }
    
    // Apply pagination
    query = query.range(offset, offset + limit - 1)
    
    const { data, error, count } = await query
    
    if (error) {
      // Table might not exist yet
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        return NextResponse.json({
          data: [],
          total: 0,
          page,
          limit,
          tableExists: false,
          message: 'Audit log table does not exist. Please run the migration SQL.'
        })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({
      data,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      tableExists: true
    })
    
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
