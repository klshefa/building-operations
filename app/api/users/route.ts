import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit, getChangedFields, extractUserAuditFields } from '@/lib/audit'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET all users
export async function GET() {
  try {
    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('ops_users')
      .select('*')
      .order('email')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - add new user
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, name, role, teams, performed_by } = body

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('ops_users')
      .insert({
        email: email.toLowerCase().trim(),
        name: name || null,
        role: role || 'viewer',
        teams: teams || [],
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      if (error.message.includes('duplicate') || error.code === '23505') {
        return NextResponse.json({ error: 'This user already has access' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log
    await logAudit({
      entityType: 'ops_users',
      entityId: data.id,
      action: 'CREATE',
      userEmail: performed_by,
      newValues: extractUserAuditFields(data),
      apiRoute: '/api/users',
      httpMethod: 'POST',
    })

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - update user
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, performed_by, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // Get old values for audit
    const { data: oldData } = await supabase
      .from('ops_users')
      .select('*')
      .eq('id', id)
      .single()
    
    const { data, error } = await supabase
      .from('ops_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      const oldValues = extractUserAuditFields(oldData)
      const newValues = extractUserAuditFields(data)
      const changedFields = getChangedFields(oldValues, newValues)
      
      if (changedFields) {
        await logAudit({
          entityType: 'ops_users',
          entityId: id,
          action: 'UPDATE',
          userEmail: performed_by,
          changedFields,
          oldValues,
          newValues,
          apiRoute: '/api/users',
          httpMethod: 'PATCH',
        })
      }
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - remove user
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const performed_by = searchParams.get('performed_by')

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // Get old values for audit before delete
    const { data: oldData } = await supabase
      .from('ops_users')
      .select('*')
      .eq('id', id)
      .single()
    
    const { error } = await supabase
      .from('ops_users')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Audit log
    if (oldData) {
      await logAudit({
        entityType: 'ops_users',
        entityId: id,
        action: 'DELETE',
        userEmail: performed_by || undefined,
        oldValues: extractUserAuditFields(oldData),
        apiRoute: '/api/users',
        httpMethod: 'DELETE',
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
