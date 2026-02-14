import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross OAuth configuration
const VERACROSS_CLIENT_ID = process.env.VERACROSS_CLIENT_ID
const VERACROSS_CLIENT_SECRET = process.env.VERACROSS_CLIENT_SECRET
const VERACROSS_TOKEN_URL = process.env.VERACROSS_TOKEN_URL || 'https://accounts.veracross.com/shefa/oauth/token'
const VERACROSS_API_BASE = process.env.VERACROSS_API_BASE || 'https://api.veracross.com/shefa/v3'
const VERACROSS_SCOPES = process.env.VERACROSS_SCOPES || 'resource_reservations:list'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get or refresh Veracross access token
async function getAccessToken(supabase: ReturnType<typeof getSupabaseClient>): Promise<string> {
  // Check cache first
  const { data: cached } = await supabase
    .from('veracross_tokens')
    .select('*')
    .eq('id', 'default')
    .single()

  const now = new Date()
  
  // If we have a valid cached token, use it
  // BUT also check if the scopes match - if scopes changed, we need a new token
  if (cached?.access_token && cached?.expires_at) {
    const expiresAt = new Date(cached.expires_at)
    const cachedScopes = cached.scope || ''
    const requestedScopes = VERACROSS_SCOPES
    
    // Check if scopes match (order-independent comparison)
    const cachedScopeArr: string[] = cachedScopes.split(' ').filter(Boolean)
    const requestedScopeArr: string[] = requestedScopes.split(' ').filter(Boolean)
    const requestedScopeSet = new Set<string>(requestedScopeArr)
    const scopesMatch = cachedScopeArr.length === requestedScopeArr.length && 
      cachedScopeArr.every((s: string) => requestedScopeSet.has(s))
    
    // Add 5 minute buffer
    if (scopesMatch && expiresAt > new Date(now.getTime() + 5 * 60 * 1000)) {
      console.log('Using cached Veracross token (scopes match)')
      return cached.access_token
    }
    
    if (!scopesMatch) {
      console.log('Cached token scopes do not match requested scopes - refreshing')
      console.log('Cached:', cachedScopes)
      console.log('Requested:', requestedScopes)
    }
  }

  // Request new token
  console.log('Requesting new Veracross token')
  
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
      scope: VERACROSS_SCOPES,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Failed to get Veracross token: ${tokenResponse.status} - ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  
  // Calculate expiration (token usually valid for 1 hour)
  const expiresAt = new Date(now.getTime() + (tokenData.expires_in || 3600) * 1000)

  // Cache the token - store the REQUESTED scopes so we can detect changes
  await supabase
    .from('veracross_tokens')
    .upsert({
      id: 'default',
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_at: expiresAt.toISOString(),
      scope: VERACROSS_SCOPES, // Store requested scopes, not returned scopes
      updated_at: now.toISOString(),
    })

  return tokenData.access_token
}

// Parse time string to minutes since midnight for comparison
function parseTimeToMinutes(timeStr: string | null | undefined): number | null {
  if (!timeStr) return null
  
  // Handle ISO datetime format "1900-01-01T09:00:00Z" or "2026-02-16T09:00:00Z"
  const iso = timeStr.match(/T(\d{2}):(\d{2}):(\d{2})/)
  if (iso) {
    return parseInt(iso[1]) * 60 + parseInt(iso[2])
  }
  
  // Handle "HH:MM" format
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) {
    return parseInt(hhmm[1]) * 60 + parseInt(hhmm[2])
  }
  
  // Handle "HH:MM:SS" format
  const hhmmss = timeStr.match(/^(\d{1,2}):(\d{2}):\d{2}$/)
  if (hhmmss) {
    return parseInt(hhmmss[1]) * 60 + parseInt(hhmmss[2])
  }
  
  // Handle "H:MM am/pm" format
  const ampm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i)
  if (ampm) {
    let hours = parseInt(ampm[1])
    const minutes = parseInt(ampm[2])
    const period = ampm[3].toLowerCase()
    
    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    
    return hours * 60 + minutes
  }
  
  return null
}

// Format time for display (extracts time from ISO or returns as-is)
function formatTimeForDisplay(timeStr: string | null | undefined): string {
  if (!timeStr) return ''
  
  // Handle ISO datetime format - extract just the time part
  const iso = timeStr.match(/T(\d{2}):(\d{2})/)
  if (iso) {
    const hours = parseInt(iso[1])
    const minutes = iso[2]
    const period = hours >= 12 ? 'PM' : 'AM'
    const displayHours = hours % 12 || 12
    return `${displayHours}:${minutes} ${period}`
  }
  
  return timeStr
}

// Check if two time ranges overlap
function timesOverlap(
  start1: number | null,
  end1: number | null,
  start2: number | null,
  end2: number | null
): boolean {
  // If any time is missing, we can't determine overlap
  if (start1 === null || end1 === null || start2 === null || end2 === null) {
    return false // Will be handled as "possible conflict"
  }
  
  return start1 < end2 && end1 > start2
}

// Detect parent/child/sibling resource relationships
// Pattern: "Ulam" is parent of "Ulam Side 1" and "Ulam Side 2"
function getResourceRelationships(resourceName: string): {
  parent: string | null,
  siblings: string[],
  isChild: boolean
} {
  // Check if this is a "Side X" resource
  const sideMatch = resourceName.match(/^(.+?)\s+Side\s+(\d+)$/i)
  
  if (sideMatch) {
    // This is a child resource (e.g., "Ulam Side 1")
    const parent = sideMatch[1].trim() // "Ulam"
    const sideNum = parseInt(sideMatch[2])
    
    // Generate sibling names (assume Side 1 and Side 2 exist)
    const siblings: string[] = []
    for (let i = 1; i <= 2; i++) {
      if (i !== sideNum) {
        siblings.push(`${parent} Side ${i}`)
      }
    }
    
    return { parent, siblings, isChild: true }
  }
  
  // Check if this could be a parent resource
  // A parent would have children like "X Side 1", "X Side 2"
  return {
    parent: null,
    siblings: [],
    isChild: false
  }
}

// Get all resource names to check for a given resource
function getRelatedResourceNames(resourceName: string): {
  blocking: string[],   // Resources that would block this booking
  adjacent: string[]    // Resources that are adjacent (informational)
} {
  const relationships = getResourceRelationships(resourceName)
  
  const blocking: string[] = [resourceName] // Always check exact match
  const adjacent: string[] = []
  
  if (relationships.isChild && relationships.parent) {
    // If booking "Ulam Side 1", also blocked by "Ulam"
    blocking.push(relationships.parent)
    // Siblings are adjacent (informational)
    adjacent.push(...relationships.siblings)
  } else {
    // If booking "Ulam" (parent), also blocked by all children
    blocking.push(`${resourceName} Side 1`)
    blocking.push(`${resourceName} Side 2`)
  }
  
  return { blocking, adjacent }
}

export interface AvailabilityRequest {
  resource_name: string       // e.g., "Beit Midrash"
  resource_id?: number        // Optional VC resource ID if known
  date: string               // YYYY-MM-DD
  start_time: string         // HH:MM
  end_time: string           // HH:MM
}

export interface ConflictInfo {
  type: 'definite' | 'possible'
  reservation_id: number
  description: string
  resource_name?: string      // Which resource this conflict is on
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  event_name?: string
  contact_person?: string
}

export interface AdjacentBooking {
  reservation_id: number
  description: string
  resource_name: string       // e.g., "Ulam Side 2"
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  event_name?: string
  note: string               // e.g., "Adjacent space has booking"
}

export interface AvailabilityResponse {
  available: boolean
  conflicts: ConflictInfo[]
  possible_conflicts: ConflictInfo[]
  adjacent_bookings: AdjacentBooking[]  // Sibling resources with bookings
  raw_reservations?: any[]   // For debugging
  error?: string
}

export async function POST(request: Request) {
  try {
    const body: AvailabilityRequest = await request.json()
    const { resource_name, resource_id, date, start_time, end_time } = body

    if (!resource_name || !date) {
      return NextResponse.json({
        available: false,
        conflicts: [],
        possible_conflicts: [],
        adjacent_bookings: [],
        error: 'resource_name and date are required'
      } as AvailabilityResponse, { status: 400 })
    }

    const supabase = getSupabaseClient()
    
    // Get access token
    const accessToken = await getAccessToken(supabase)
    
    // Build query parameters for Veracross API
    // Query reservations on the specified date
    const queryParams = new URLSearchParams()
    
    // Filter by date - get reservations that start on this date
    queryParams.set('on_or_after_start_date', date)
    queryParams.set('on_or_before_start_date', date)
    
    // If we have a resource_id, filter by that too
    if (resource_id) {
      queryParams.set('resource_id', resource_id.toString())
    }
    
    // Veracross v3 API endpoint for resource reservations
    const apiUrl = `${VERACROSS_API_BASE}/resource_reservations/reservations?${queryParams.toString()}`
    
    console.log('Querying Veracross:', apiUrl)
    console.log('Using token:', accessToken ? 'Yes (length: ' + accessToken.length + ')' : 'No')
    
    const response = await fetch(apiUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Veracross API error:', response.status, errorText, 'URL:', apiUrl)
      
      // If 404, provide more helpful error
      if (response.status === 404) {
        return NextResponse.json({
          available: false,
          conflicts: [],
          possible_conflicts: [],
          adjacent_bookings: [],
          error: `Veracross API endpoint not found (404). Check VERACROSS_API_BASE and scope. Tried: ${apiUrl}`,
          debug: { url: apiUrl, status: response.status, body: errorText }
        } as AvailabilityResponse, { status: 500 })
      }
      
      return NextResponse.json({
        available: false,
        conflicts: [],
        possible_conflicts: [],
        adjacent_bookings: [],
        error: `Veracross API error: ${response.status}`,
        debug: { url: apiUrl, status: response.status, body: errorText }
      } as AvailabilityResponse, { status: 500 })
    }

    const data = await response.json()
    const reservations = data.data || data || []
    
    console.log(`Found ${reservations.length} reservations from Veracross`)

    // Get related resources (blocking and adjacent)
    const { blocking: blockingResources, adjacent: adjacentResources } = getRelatedResourceNames(resource_name)
    console.log(`Checking resources - Blocking: ${blockingResources.join(', ')} | Adjacent: ${adjacentResources.join(', ')}`)

    // Helper to get resource name from reservation
    const getResName = (r: any): string => {
      return r.resource?.description || r.resource?.name || 
             r.resource_description || r.resource_name || 
             (typeof r.resource === 'string' ? r.resource : '') || ''
    }

    // Helper to check if a reservation matches any of the given resource names
    const matchesAnyResource = (r: any, resourceNames: string[]): string | null => {
      const resName = getResName(r)
      for (const targetName of resourceNames) {
        if (resName.toLowerCase().includes(targetName.toLowerCase()) ||
            targetName.toLowerCase().includes(resName.toLowerCase())) {
          return resName
        }
      }
      return null
    }

    // Filter reservations into blocking and adjacent categories
    const blockingReservations: Array<{ res: any, matchedResource: string }> = []
    const adjacentReservations: Array<{ res: any, matchedResource: string }> = []

    for (const r of reservations) {
      const blockingMatch = matchesAnyResource(r, blockingResources)
      if (blockingMatch) {
        blockingReservations.push({ res: r, matchedResource: blockingMatch })
        continue
      }
      
      const adjacentMatch = matchesAnyResource(r, adjacentResources)
      if (adjacentMatch) {
        adjacentReservations.push({ res: r, matchedResource: adjacentMatch })
      }
    }

    console.log(`${blockingReservations.length} blocking, ${adjacentReservations.length} adjacent`)

    const conflicts: ConflictInfo[] = []
    const possibleConflicts: ConflictInfo[] = []
    const adjacentBookings: AdjacentBooking[] = []
    
    const requestedStart = parseTimeToMinutes(start_time)
    const requestedEnd = parseTimeToMinutes(end_time)

    // Helper to check date and day pattern
    const isReservationOnDate = (res: any): boolean => {
      const resStartDate = res.start_date || res.begin_date
      const resEndDate = res.end_date || resStartDate
      
      // Skip if date doesn't match
      if (resStartDate > date || (resEndDate && resEndDate < date)) {
        return false
      }
      
      // For recurring reservations, check if our day of week matches
      if (res.days && resEndDate !== resStartDate) {
        const requestedDate = new Date(date)
        const dayOfWeek = requestedDate.getDay() // 0=Sun, 1=Mon, etc.
        const dayMap: Record<number, string> = {
          0: 'Su', 1: 'M', 2: 'T', 3: 'W', 4: 'Th', 5: 'F', 6: 'Sa'
        }
        const dayCode = dayMap[dayOfWeek]
        
        // Check if this day is in the pattern
        if (!res.days.includes(dayCode)) {
          return false
        }
      }
      
      return true
    }

    // Process blocking reservations (conflicts)
    for (const { res, matchedResource } of blockingReservations) {
      if (!isReservationOnDate(res)) continue
      
      const resStartDate = res.start_date || res.begin_date
      const resEndDate = res.end_date || resStartDate
      const resStart = parseTimeToMinutes(res.start_time || res.begin_time)
      const resEnd = parseTimeToMinutes(res.end_time)
      
      const conflictInfo: ConflictInfo = {
        type: 'possible',
        reservation_id: res.id || res.reservation_id,
        description: res.description || res.event_description || 'Reservation',
        resource_name: matchedResource,
        start_date: resStartDate,
        end_date: resEndDate,
        start_time: formatTimeForDisplay(res.start_time || res.begin_time),
        end_time: formatTimeForDisplay(res.end_time),
        event_name: res.event?.name || res.event_name,
        contact_person: res.contact_person || res.event?.contact_person,
      }
      
      // Determine if definite or possible conflict
      if (requestedStart !== null && requestedEnd !== null && 
          resStart !== null && resEnd !== null) {
        // We have all time data - can definitively determine conflict
        if (timesOverlap(requestedStart, requestedEnd, resStart, resEnd)) {
          conflictInfo.type = 'definite'
          conflicts.push(conflictInfo)
        }
        // No overlap - not a conflict, don't add
      } else {
        // Missing time data - can't determine, mark as possible
        conflictInfo.type = 'possible'
        possibleConflicts.push(conflictInfo)
      }
    }

    // Process adjacent reservations (informational - sibling resources)
    for (const { res, matchedResource } of adjacentReservations) {
      if (!isReservationOnDate(res)) continue
      
      const resStartDate = res.start_date || res.begin_date
      const resEndDate = res.end_date || resStartDate
      const resStart = parseTimeToMinutes(res.start_time || res.begin_time)
      const resEnd = parseTimeToMinutes(res.end_time)
      
      // Only show adjacent bookings that overlap with our time
      const overlaps = (requestedStart !== null && requestedEnd !== null && 
                        resStart !== null && resEnd !== null)
        ? timesOverlap(requestedStart, requestedEnd, resStart, resEnd)
        : true // If time unknown, show it anyway
      
      if (overlaps) {
        adjacentBookings.push({
          reservation_id: res.id || res.reservation_id,
          description: res.description || res.event_description || 'Reservation',
          resource_name: matchedResource,
          start_date: resStartDate,
          end_date: resEndDate,
          start_time: formatTimeForDisplay(res.start_time || res.begin_time),
          end_time: formatTimeForDisplay(res.end_time),
          event_name: res.event?.name || res.event_name,
          note: `Adjacent space (${matchedResource}) has a booking during this time`,
        })
      }
    }

    const available = conflicts.length === 0

    return NextResponse.json({
      available,
      conflicts,
      possible_conflicts: possibleConflicts,
      adjacent_bookings: adjacentBookings,
      raw_reservations: reservations, // Full API response for debugging
      blocking_count: blockingReservations.length,
      adjacent_count: adjacentReservations.length,
      total_count: reservations.length,
    } as AvailabilityResponse)

  } catch (error: any) {
    console.error('Availability check error:', error)
    return NextResponse.json({
      available: false,
      conflicts: [],
      possible_conflicts: [],
      adjacent_bookings: [],
      error: error.message || 'Failed to check availability'
    } as AvailabilityResponse, { status: 500 })
  }
}
