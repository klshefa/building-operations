import { NextResponse } from 'next/server'

const SYNC_ENDPOINTS = [
  'resources',
  'group-events',
  'resource-reservations',
  'calendar-staff',
  'calendar-ls',
  'calendar-ms',
]

export async function POST(request: Request) {
  const startTime = Date.now()
  const results: Record<string, { success: boolean; message: string; records?: number }> = {}
  
  // Get base URL from request origin
  const url = new URL(request.url)
  const baseUrl = `${url.protocol}//${url.host}`

  // Run syncs sequentially to avoid overwhelming the APIs
  for (const endpoint of SYNC_ENDPOINTS) {
    try {
      console.log(`Syncing ${endpoint}...`)
      const response = await fetch(`${baseUrl}/api/sync/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()
      results[endpoint] = {
        success: data.success,
        message: data.message || data.error || 'Unknown',
        records: data.records
      }
    } catch (error: any) {
      results[endpoint] = {
        success: false,
        message: error.message || 'Failed to sync'
      }
    }
  }

  // After syncing all sources, trigger event aggregation
  try {
    const aggregateResponse = await fetch(`${baseUrl}/api/aggregate-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const aggregateData = await aggregateResponse.json()
    results['aggregate'] = {
      success: aggregateData.success,
      message: aggregateData.message || aggregateData.error || 'Unknown',
      records: aggregateData.events_created
    }
  } catch (error: any) {
    results['aggregate'] = {
      success: false,
      message: error.message || 'Failed to aggregate'
    }
  }

  // Apply event filters to hide matching events
  try {
    const filterResponse = await fetch(`${baseUrl}/api/filters/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const filterData = await filterResponse.json()
    results['filters'] = {
      success: filterData.success,
      message: filterData.message || filterData.error || 'Unknown',
      records: filterData.hidden_count
    }
  } catch (error: any) {
    results['filters'] = {
      success: false,
      message: error.message || 'Failed to apply filters'
    }
  }

  const totalRecords = Object.values(results)
    .filter(r => r.success)
    .reduce((sum, r) => sum + (r.records || 0), 0)

  const allSuccess = Object.values(results).every(r => r.success)

  return NextResponse.json({
    success: allSuccess,
    message: allSuccess 
      ? `Full sync completed: ${totalRecords} total records` 
      : 'Some syncs failed',
    results,
    duration_ms: Date.now() - startTime
  })
}
