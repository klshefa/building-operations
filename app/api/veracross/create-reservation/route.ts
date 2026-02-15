import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Veracross OAuth configuration
const VERACROSS_CLIENT_ID = process.env.VERACROSS_CLIENT_ID
const VERACROSS_CLIENT_SECRET = process.env.VERACROSS_CLIENT_SECRET
const VERACROSS_TOKEN_URL = process.env.VERACROSS_TOKEN_URL || 'https://accounts.veracross.com/shefa/oauth/token'
const VERACROSS_API_BASE = process.env.VERACROSS_API_BASE || 'https://api.veracross.com/shefa/v3'

// Scope for resource reservations
const RESERVATION_SCOPE = 'resource_reservations.reservations:create'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Get a token with reservation create scope
async function getReservationToken(): Promise<string> {
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
      scope: RESERVATION_SCOPE,
    }),
  })

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text()
    throw new Error(`Failed to get reservation token: ${tokenResponse.status} - ${errorText}`)
  }

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

export interface CreateReservationRequest {
  description: string
  resource_id: number  // Veracross resource ID
  resource_name: string  // For display/logging
  start_date: string
  end_date?: string
  start_time: string
  end_time: string
  requestor_id: number  // Person_ID from Staff table
  requestor_email: string  // For audit
}

export interface CreateReservationResponse {
  success: boolean
  reservation_id?: string
  error?: string
  veracross_response?: any
}

// POST - Create a new reservation in Veracross
export async function POST(request: Request) {
  try {
    const body: CreateReservationRequest = await request.json()
    
    const {
      description,
      resource_id,
      resource_name,
      start_date,
      end_date,
      start_time,
      end_time,
      requestor_id,
      requestor_email
    } = body

    // Validate required fields
    if (!description) {
      return NextResponse.json({ 
        success: false, 
        error: 'Description is required' 
      }, { status: 400 })
    }
    if (!resource_id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Resource ID is required' 
      }, { status: 400 })
    }
    if (!start_date || !start_time || !end_time) {
      return NextResponse.json({ 
        success: false, 
        error: 'Date and times are required' 
      }, { status: 400 })
    }
    if (!requestor_id) {
      return NextResponse.json({ 
        success: false, 
        error: 'Requestor ID (Person_ID) is required' 
      }, { status: 400 })
    }

    console.log(`Creating Veracross reservation: ${description}`)
    console.log(`Resource: ${resource_name} (ID: ${resource_id})`)
    console.log(`Date: ${start_date}, Time: ${start_time}-${end_time}`)
    console.log(`Requestor: ${requestor_email} (ID: ${requestor_id})`)

    // Get OAuth token
    const accessToken = await getReservationToken()

    // Build the reservation payload
    // Veracross API requires data to be wrapped in a "data" field
    // Field names from Veracross API docs for POST /resource_reservations/reservations
    const reservationData = {
      resource_id: resource_id,
      start_date: start_date,
      end_date: end_date || start_date,
      start_time: start_time,
      end_time: end_time,
      requesting_person_id: String(requestor_id),  // API shows this as string
      notes: description,  // No title/name field - use notes for the description
    }
    
    const reservationPayload = {
      data: reservationData
    }

    console.log('Sending to Veracross:', JSON.stringify(reservationPayload, null, 2))

    // Call Veracross API to create reservation
    const response = await fetch(`${VERACROSS_API_BASE}/resource_reservations/reservations`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reservationPayload),
    })

    const responseText = await response.text()
    let responseData: any
    
    try {
      responseData = JSON.parse(responseText)
    } catch {
      responseData = { raw: responseText }
    }

    if (!response.ok) {
      console.error('Veracross API error:', response.status, responseText)
      console.error('Request payload was:', JSON.stringify(reservationPayload, null, 2))
      
      // Extract error message from Veracross response
      let errorMessage = `Veracross API error: ${response.status}`
      if (responseData.error) {
        errorMessage = responseData.error
      } else if (responseData.errors) {
        // Handle array of errors
        errorMessage = Array.isArray(responseData.errors) 
          ? responseData.errors.map((e: any) => e.message || e.detail || JSON.stringify(e)).join(', ')
          : JSON.stringify(responseData.errors)
      } else if (responseData.message) {
        errorMessage = responseData.message
      } else if (responseData.raw) {
        errorMessage = responseData.raw.substring(0, 200)
      }
      
      // Check for specific error types
      if (response.status === 409 || responseText.includes('conflict')) {
        return NextResponse.json({
          success: false,
          error: 'Sorry, this slot was just booked. Please try another time.',
          veracross_response: responseData
        }, { status: 409 })
      }
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        veracross_response: responseData,
        request_payload: reservationPayload
      }, { status: response.status })
    }

    // Extract reservation ID from response
    const reservationId = responseData.data?.resource_reservation_id || 
                         responseData.data?.id || 
                         responseData.id || 
                         responseData.reservation_id ||
                         null

    console.log('Reservation created successfully:', reservationId)

    const supabase = getSupabaseClient()
    
    // IMMEDIATELY create ops_events record so the slot shows as booked
    // This prevents double-booking before BigQuery sync runs
    let opsEventId: string | null = null
    let opsEventError: string | null = null
    try {
      const { data: newEvent, error: insertError } = await supabase
        .from('ops_events')
        .insert({
          title: description,
          description: description,
          start_date: start_date,
          end_date: end_date || start_date,
          start_time: start_time,
          end_time: end_time,
          resource_id: resource_id,
          location: resource_name,
          event_type: 'other',
          // Required fields for ops_events schema
          primary_source: 'manual',
          sources: ['manual'],
          source_events: [],
          is_hidden: false,
          has_conflict: false,
          conflict_ok: false,
          all_day: false,
          needs_program_director: false,
          needs_office: false,
          needs_it: false,
          needs_security: false,
          needs_facilities: false,
          food_served: false,
          building_open: false,
          // Self-service fields
          status: 'active',
          requested_by: requestor_email,
          requested_at: new Date().toISOString(),
          veracross_reservation_id: reservationId?.toString(),
          created_by: requestor_email,
        })
        .select('id')
        .single()
      
      if (insertError) {
        console.error('Failed to create ops_events record:', insertError)
        opsEventError = insertError.message
      } else {
        opsEventId = newEvent?.id
        console.log('Created ops_events record:', opsEventId)
      }
    } catch (err: any) {
      console.error('ops_events insert failed:', err)
      opsEventError = err.message || 'Unknown error'
    }

    // Log to audit
    try {
      await supabase.from('ops_audit_log').insert({
        entity_type: 'veracross_reservation',
        entity_id: reservationId?.toString() || 'unknown',
        action: 'CREATE',
        user_email: requestor_email,
        new_values: {
          description,
          resource_id,
          resource_name,
          start_date,
          end_date: end_date || start_date,
          start_time,
          end_time,
          requestor_id,
          veracross_reservation_id: reservationId,
          ops_event_id: opsEventId
        },
        api_route: '/api/veracross/create-reservation',
        http_method: 'POST'
      })
    } catch (err) {
      console.warn('Audit log failed:', err)
    }

    return NextResponse.json({
      success: true,
      reservation_id: reservationId?.toString(),
      ops_event_id: opsEventId,
      ops_event_error: opsEventError,
      veracross_response: responseData
    } as CreateReservationResponse)

  } catch (error: any) {
    console.error('Create reservation error:', error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to create reservation'
    } as CreateReservationResponse, { status: 500 })
  }
}
