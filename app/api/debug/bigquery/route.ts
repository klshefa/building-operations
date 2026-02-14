import { NextResponse } from 'next/server'
import { BigQuery } from '@google-cloud/bigquery'
import { verifyApiAuth, isAuthError } from '@/lib/api-auth'

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

export async function GET(request: Request) {
  // Verify authentication - admin only for debug routes
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || 'Keith'
  
  try {
    const bigquery = getBigQueryClient()
    
    // Check resource_reservations for search term
    const [resRows] = await bigquery.query({
      query: `
        SELECT 
          Description,
          Resource,
          Start_Date,
          End_Date,
          IFNULL(CAST(End_Date AS STRING), 'NULL') as end_date_check,
          Start_Time,
          End_Time,
          Days,
          Class_Schedule
        FROM \`vc_data.resource_reservations\`
        WHERE LOWER(Description) LIKE LOWER(@search)
        LIMIT 10
      `,
      params: { search: `%${search}%` },
      location: 'US'
    })
    
    // Check group_events for search term
    const [groupRows] = await bigquery.query({
      query: `
        SELECT 
          event_id,
          description,
          Resource,
          Start_Date,
          Start_Time
        FROM \`vc_data.group_events\`
        WHERE LOWER(description) LIKE LOWER(@search)
        LIMIT 10
      `,
      params: { search: `%${search}%` },
      location: 'US'
    })
    
    return NextResponse.json({
      search,
      resource_reservations: resRows,
      group_events: groupRows
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
