import { NextResponse } from 'next/server'
import { verifyApiAuth, isAuthError } from '@/lib/api-auth'

// Veracross OAuth configuration
const VERACROSS_CLIENT_ID = process.env.VERACROSS_CLIENT_ID
const VERACROSS_CLIENT_SECRET = process.env.VERACROSS_CLIENT_SECRET
const VERACROSS_TOKEN_URL = process.env.VERACROSS_TOKEN_URL || 'https://accounts.veracross.com/shefa/oauth/token'
const VERACROSS_API_BASE = process.env.VERACROSS_API_BASE || 'https://api.veracross.com/shefa/v3'

// Scope for class schedules - may need to be added to Veracross app
const CLASS_SCHEDULES_SCOPE = 'academics.class_schedules:list'

// Get a fresh token with class schedules scope
async function getClassSchedulesToken(): Promise<string> {
  if (!VERACROSS_CLIENT_ID || !VERACROSS_CLIENT_SECRET) {
    throw new Error('Veracross OAuth credentials not configured')
  }

  const tokenResponse = await fetch(VERACROSS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: VERACROSS_CLIENT_ID,
      client_secret: VERACROSS_CLIENT_SECRET,
      scope: CLASS_SCHEDULES_SCOPE,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Failed to get token: ${tokenResponse.status} - ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

export async function GET(request: Request) {
  // Verify authentication - admin only for test routes
  const auth = await verifyApiAuth()
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const resourceName = searchParams.get('resource') || ''
    
    // Get token
    const accessToken = await getClassSchedulesToken()
    
    // Build query - the endpoint is /academics/class_schedules
    const apiUrl = `${VERACROSS_API_BASE}/academics/class_schedules`
    
    console.log('Querying Veracross Class Schedules:', apiUrl)
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'X-Page-Size': '1000', // Max allowed per page
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({
        success: false,
        error: `API error: ${response.status}`,
        details: errorText,
        url: apiUrl,
        hint: 'You may need to enable the academics.class_schedules:list scope in Veracross'
      }, { status: response.status })
    }

    const data = await response.json()
    const schedules = data.data || data || []
    
    // If filtering by resource, do it client-side for now
    let filteredSchedules = schedules
    if (resourceName) {
      filteredSchedules = schedules.filter((s: any) => {
        // Check all possible room fields
        const roomDesc = s.room?.description || ''
        const roomAbbrev = s.room?.abbreviation || ''
        const roomName = s.room?.name || s.room_name || s.location || ''
        const searchLower = resourceName.toLowerCase()
        return roomDesc.toLowerCase().includes(searchLower) ||
               roomAbbrev.toLowerCase().includes(searchLower) ||
               roomName.toLowerCase().includes(searchLower)
      })
    }

    return NextResponse.json({
      success: true,
      total_count: schedules.length,
      filtered_count: filteredSchedules.length,
      filter_applied: resourceName || null,
      sample_schedules: filteredSchedules.slice(0, 20),
      raw_first_item: schedules[0] || null, // Show full structure of first item
    })

  } catch (error: any) {
    console.error('Class schedules test error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to query class schedules'
    }, { status: 500 })
  }
}
