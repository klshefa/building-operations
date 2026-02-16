import { NextResponse } from 'next/server'
import { BigQuery } from '@google-cloud/bigquery'
import { createClient } from '@supabase/supabase-js'

const SOURCE_NAME = 'bigquery_resources'

function getBigQueryClient() {
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (credentials) {
    return new BigQuery({
      credentials: JSON.parse(credentials),
      projectId: JSON.parse(credentials).project_id,
    })
  }
  return new BigQuery()
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const bigquery = getBigQueryClient()
    const supabase = getSupabaseClient()

    // Query BigQuery for resources
    const query = `
      SELECT
        Resource_ID as id,
        Resource_Type as resource_type,
        Description as description,
        Abbreviation as abbreviation,
        Capacity as capacity,
        Responsible_Person as responsible_person
      FROM \`vc_data.resource_list\`
    `

    const [rows] = await bigquery.query({ query, location: 'US' })

    console.log(`Fetched ${rows.length} resources from BigQuery`)

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No resources to sync',
        records: 0,
        duration_ms: Date.now() - startTime
      })
    }

    // Transform data
    const resources = rows.map((row: any) => ({
      id: row.id,
      resource_type: row.resource_type,
      description: row.description,
      abbreviation: row.abbreviation,
      capacity: row.capacity,
      responsible_person: row.responsible_person === 'None' ? null : row.responsible_person,
      synced_at: new Date().toISOString()
    }))

    // Upsert resources
    const { error } = await supabase
      .from('ops_resources')
      .upsert(resources, { onConflict: 'id' })

    if (error) {
      throw error
    }

    // Log successful sync
    await supabase.from('ops_sync_log').insert({
      source: SOURCE_NAME,
      status: 'completed',
      events_synced: resources.length,
      completed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      message: `Synced ${resources.length} resources`,
      records: resources.length,
      duration_ms: Date.now() - startTime
    })

  } catch (error: any) {
    console.error('Sync error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Sync failed',
      duration_ms: Date.now() - startTime
    }, { status: 500 })
  }
}
