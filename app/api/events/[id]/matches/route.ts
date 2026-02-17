import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logAudit } from '@/lib/audit'

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Calculate string similarity (Jaccard-ish approach on words)
function stringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0
  
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(w => w.length > 2))
  
  if (words1.size === 0 || words2.size === 0) return 0
  
  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])
  
  return intersection.size / union.size
}

// Check if locations match (fuzzy)
function locationMatches(loc1: string | null, loc2: string | null): boolean {
  if (!loc1 || !loc2) return false
  
  const clean1 = loc1.toLowerCase().trim()
  const clean2 = loc2.toLowerCase().trim()
  
  // Exact match
  if (clean1 === clean2) return true
  
  // One contains the other
  if (clean1.includes(clean2) || clean2.includes(clean1)) return true
  
  // Extract room numbers and compare
  const num1 = clean1.match(/\d+/)?.[0]
  const num2 = clean2.match(/\d+/)?.[0]
  if (num1 && num2 && num1 === num2) return true
  
  return false
}

// Parse time to minutes for comparison
function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null
  
  // Handle ISO datetime format
  const iso = timeStr.match(/T(\d{2}):(\d{2})/)
  if (iso) {
    return parseInt(iso[1]) * 60 + parseInt(iso[2])
  }
  
  // Handle "HH:MM" format
  const hhmm = timeStr.match(/^(\d{1,2}):(\d{2})/)
  if (hhmm) {
    return parseInt(hhmm[1]) * 60 + parseInt(hhmm[2])
  }
  
  return null
}

// Check if times overlap
function timesOverlap(
  start1: string | null, end1: string | null,
  start2: string | null, end2: string | null
): boolean {
  const s1 = parseTimeToMinutes(start1)
  const e1 = parseTimeToMinutes(end1)
  const s2 = parseTimeToMinutes(start2)
  const e2 = parseTimeToMinutes(end2)
  
  if (s1 === null || e1 === null || s2 === null || e2 === null) {
    return false
  }
  
  return s1 < e2 && e1 > s2
}

interface SuggestedMatch {
  event: any
  confidence: number
  reasons: string[]
}

// GET: Fetch linked events and suggestions
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const supabase = createAdminClient()
    
    // Get the main event
    const { data: event, error: eventError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('id', id)
      .single()
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    // Get already linked raw events
    const { data: matches, error: matchError } = await supabase
      .from('ops_event_matches')
      .select(`
        raw_event_id,
        match_type,
        match_confidence,
        matched_at,
        matched_by,
        ops_raw_events (*)
      `)
      .eq('event_id', id)
    
    const linked: any[] = []
    const linkedRawIds = new Set<string>()
    
    if (matches) {
      for (const m of matches) {
        const rawEvent = m.ops_raw_events as any
        if (rawEvent && rawEvent.id) {
          linked.push({
            ...rawEvent,
            match_type: m.match_type,
            match_confidence: m.match_confidence,
            matched_at: m.matched_at,
            matched_by: m.matched_by
          })
          linkedRawIds.add(rawEvent.id)
        }
      }
    }
    
    // Get IDs of raw events linked to ANY ops_event (to avoid suggesting already-matched events)
    const { data: allMatches } = await supabase
      .from('ops_event_matches')
      .select('raw_event_id')
    
    const allMatchedRawIds = new Set(allMatches?.map(m => m.raw_event_id) || [])
    
    // Also exclude raw events that are in this event's source_events array
    // (these were used to create this aggregated event)
    const sourceEventIds = new Set(event.source_events || [])
    
    // Find potential matches - unmatched raw events within date range
    const startDate = new Date(event.start_date)
    const endDate = new Date(event.end_date || event.start_date)
    
    // Expand range by 1 day on each side
    const searchStart = new Date(startDate)
    searchStart.setDate(searchStart.getDate() - 1)
    const searchEnd = new Date(endDate)
    searchEnd.setDate(searchEnd.getDate() + 1)
    
    const { data: candidates } = await supabase
      .from('ops_raw_events')
      .select('*')
      .gte('start_date', searchStart.toISOString().split('T')[0])
      .lte('start_date', searchEnd.toISOString().split('T')[0])
    
    // Score candidates
    const suggestions: SuggestedMatch[] = []
    
    for (const raw of candidates || []) {
      // Skip if already linked to this event
      if (linkedRawIds.has(raw.id)) continue
      
      // Skip if already linked to another event
      if (allMatchedRawIds.has(raw.id)) continue
      
      // Skip if this raw event was used to create this aggregated event
      if (sourceEventIds.has(raw.id)) continue
      
      let score = 0
      const reasons: string[] = []
      
      // Same date: +0.3
      if (raw.start_date === event.start_date) {
        score += 0.3
        reasons.push('Same date')
      }
      
      // Location match: +0.3
      if (locationMatches(raw.location || raw.resource, event.location)) {
        score += 0.3
        reasons.push('Same location')
      }
      
      // Time overlap: +0.2
      if (timesOverlap(raw.start_time, raw.end_time, event.start_time, event.end_time)) {
        score += 0.2
        reasons.push('Overlapping time')
      }
      
      // Title similarity: up to +0.2
      const titleSim = stringSimilarity(raw.title, event.title)
      if (titleSim > 0.3) {
        score += 0.2 * titleSim
        reasons.push('Similar name')
      }
      
      // Only include if score meets threshold
      if (score >= 0.3 && reasons.length > 0) {
        suggestions.push({
          event: raw,
          confidence: Math.min(score, 1),
          reasons
        })
      }
    }
    
    // Sort by confidence and take top 10
    suggestions.sort((a, b) => b.confidence - a.confidence)
    const topSuggestions = suggestions.slice(0, 10)
    
    return NextResponse.json({
      linked,
      suggestions: topSuggestions
    })
    
  } catch (error: any) {
    console.error('Error fetching matches:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST: Create a manual match
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  
  try {
    const body = await request.json()
    const { raw_event_id, matched_by } = body
    
    if (!raw_event_id) {
      return NextResponse.json({ error: 'raw_event_id is required' }, { status: 400 })
    }
    
    const supabase = createAdminClient()
    
    // Check if event exists
    const { data: event, error: eventError } = await supabase
      .from('ops_events')
      .select('id')
      .eq('id', id)
      .single()
    
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    
    // Check if raw event exists
    const { data: rawEvent, error: rawError } = await supabase
      .from('ops_raw_events')
      .select('id, title')
      .eq('id', raw_event_id)
      .single()
    
    if (rawError || !rawEvent) {
      return NextResponse.json({ error: 'Raw event not found' }, { status: 404 })
    }
    
    // Check if already linked to another event
    const { data: existingMatch } = await supabase
      .from('ops_event_matches')
      .select('event_id')
      .eq('raw_event_id', raw_event_id)
      .single()
    
    if (existingMatch && existingMatch.event_id !== id) {
      return NextResponse.json({ 
        error: 'This event is already linked to another ops event',
        existing_event_id: existingMatch.event_id
      }, { status: 409 })
    }
    
    // Create the match
    const { data: match, error: insertError } = await supabase
      .from('ops_event_matches')
      .upsert({
        event_id: id,
        raw_event_id: raw_event_id,
        match_type: 'manual',
        match_confidence: 1.0,
        matched_at: new Date().toISOString(),
        matched_by: matched_by || 'unknown'
      }, {
        onConflict: 'event_id,raw_event_id'
      })
      .select()
      .single()
    
    if (insertError) {
      console.error('Error creating match:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    
    // Audit log
    await logAudit({
      entityType: 'ops_event_matches',
      entityId: `${id}:${raw_event_id}`,
      action: 'CREATE',
      userEmail: matched_by,
      newValues: {
        event_id: id,
        raw_event_id: raw_event_id,
        match_type: 'manual',
        raw_event_title: rawEvent.title,
      },
      apiRoute: '/api/events/[id]/matches',
      httpMethod: 'POST',
    })
    
    return NextResponse.json({
      success: true,
      message: `Linked "${rawEvent.title}" to event`,
      match
    })
    
  } catch (error: any) {
    console.error('Error creating match:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
