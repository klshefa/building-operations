import { NextResponse } from 'next/server'
import { verifyApiAuth, isAuthError, createAdminClient } from '@/lib/api-auth'

// GET all users
export async function GET() {
  // Verify authentication
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

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

// POST - add new user (admin only)
export async function POST(request: Request) {
  // Verify authentication - admin only
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { email, name, role, teams } = body

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

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH - update user (admin only)
export async function PATCH(request: Request) {
  // Verify authentication - admin only
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { id, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    const { data, error } = await supabase
      .from('ops_users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - remove user (admin only)
export async function DELETE(request: Request) {
  // Verify authentication - admin only
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    const { error } = await supabase
      .from('ops_users')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
