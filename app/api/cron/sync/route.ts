import { NextResponse } from 'next/server'

// Verify cron secret to prevent unauthorized access
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return false
  }
  return true
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source')
  
  if (!source) {
    return NextResponse.json({ error: 'Missing source parameter' }, { status: 400 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://building-operations.vercel.app'
  
  // Map source param to sync endpoint
  const syncEndpoints: Record<string, string> = {
    'group-events': '/api/sync/group-events',
    'resource-reservations': '/api/sync/resource-reservations',
    'calendar-staff': '/api/sync/calendar-staff',
    'calendar-ls': '/api/sync/calendar-ls',
    'calendar-ms': '/api/sync/calendar-ms',
  }

  const endpoint = syncEndpoints[source]
  if (!endpoint) {
    return NextResponse.json({ error: `Unknown source: ${source}` }, { status: 400 })
  }

  try {
    console.log(`[Cron] Starting sync for ${source}`)
    
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    const data = await response.json()
    
    console.log(`[Cron] Sync complete for ${source}:`, data)
    
    return NextResponse.json({
      success: true,
      source,
      result: data,
    })
  } catch (error: any) {
    console.error(`[Cron] Sync failed for ${source}:`, error)
    return NextResponse.json({
      success: false,
      source,
      error: error.message,
    }, { status: 500 })
  }
}
