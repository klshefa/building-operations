import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/admin/resource-aliases — list all aliases, optionally filtered
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const resourceId = searchParams.get('resourceId')
    const supabase = createAdminClient()

    let query = supabase
      .from('ops_resource_aliases')
      .select('id, resource_id, alias_type, alias_value, created_at')
      .order('resource_id')
      .order('alias_type')

    if (resourceId) {
      query = query.eq('resource_id', parseInt(resourceId))
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/admin/resource-aliases — add a new alias or auto-populate
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const supabase = createAdminClient()

    // Auto-populate mode: rebuild aliases from ops_resources
    if (body.action === 'auto-populate') {
      const { data: resources, error: resError } = await supabase
        .from('ops_resources')
        .select('id, description, abbreviation')

      if (resError) throw resError

      const aliases: { resource_id: number; alias_type: string; alias_value: string }[] = []

      for (const r of resources || []) {
        aliases.push({ resource_id: r.id, alias_type: 'veracross_id', alias_value: String(r.id) })

        if (r.description?.trim()) {
          aliases.push({ resource_id: r.id, alias_type: 'description', alias_value: r.description.trim().toLowerCase() })
        }
        if (r.abbreviation?.trim()) {
          aliases.push({ resource_id: r.id, alias_type: 'abbreviation', alias_value: r.abbreviation.trim().toLowerCase() })
        }
      }

      const { data, error } = await supabase
        .from('ops_resource_aliases')
        .upsert(aliases, { onConflict: 'alias_type,alias_value', ignoreDuplicates: true })
        .select()

      if (error) throw error

      return NextResponse.json({
        message: `Auto-populated ${aliases.length} aliases from ${resources?.length} resources`,
        count: aliases.length
      })
    }

    // Single alias insert
    const { resource_id, alias_type, alias_value } = body
    if (!resource_id || !alias_type || !alias_value) {
      return NextResponse.json({ error: 'resource_id, alias_type, and alias_value required' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('ops_resource_aliases')
      .upsert({
        resource_id,
        alias_type,
        alias_value: alias_value.toLowerCase().trim()
      }, { onConflict: 'alias_type,alias_value' })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
