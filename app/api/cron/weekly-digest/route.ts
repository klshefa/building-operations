import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, buildWeeklyDigestEmail, getTeamDisplayName } from '@/lib/notifications'
import type { TeamType } from '@/lib/types'

// Create admin client for cron job
function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Team mapping for filtering
const TEAM_NEEDS_KEYS: Record<TeamType, string> = {
  program_director: 'needs_program_director',
  office: 'needs_office',
  it: 'needs_it',
  security: 'needs_security',
  facilities: 'needs_facilities',
}

export async function GET(request: Request) {
  // Verify cron secret (optional but recommended)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.log('[Weekly Digest] Unauthorized request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Weekly Digest] Starting weekly digest cron job')
  
  try {
    const supabase = createAdminClient()
    
    // Calculate date ranges
    const now = new Date()
    
    // This week: Monday to Sunday of current week
    const dayOfWeek = now.getDay()
    const monday = new Date(now)
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
    monday.setHours(0, 0, 0, 0)
    
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    
    // Looking ahead: next 2-3 weeks (from next Monday)
    const nextMonday = new Date(sunday)
    nextMonday.setDate(sunday.getDate() + 1)
    nextMonday.setHours(0, 0, 0, 0)
    
    const threeWeeksOut = new Date(nextMonday)
    threeWeeksOut.setDate(nextMonday.getDate() + 20) // About 3 weeks
    
    const thisWeekStart = monday.toISOString().split('T')[0]
    const thisWeekEnd = sunday.toISOString().split('T')[0]
    const lookAheadStart = nextMonday.toISOString().split('T')[0]
    const lookAheadEnd = threeWeeksOut.toISOString().split('T')[0]
    
    console.log(`[Weekly Digest] This week: ${thisWeekStart} to ${thisWeekEnd}`)
    console.log(`[Weekly Digest] Looking ahead: ${lookAheadStart} to ${lookAheadEnd}`)
    
    // Get all active users
    const { data: users, error: usersError } = await supabase
      .from('ops_users')
      .select('id, email, name, teams, role')
      .eq('is_active', true)
    
    if (usersError) {
      console.error('[Weekly Digest] Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
    
    if (!users || users.length === 0) {
      console.log('[Weekly Digest] No users to send digest to')
      return NextResponse.json({ success: true, message: 'No users to notify', sent: 0 })
    }
    
    console.log(`[Weekly Digest] Found ${users.length} users to process`)
    
    // Get all mentions to find events where users were mentioned
    const { data: allMentions } = await supabase
      .from('event_mentions')
      .select('event_id, mentioned_email')
    
    // Build a map of email -> set of event IDs where they were mentioned
    const mentionMap = new Map<string, Set<string>>()
    allMentions?.forEach(mention => {
      const email = mention.mentioned_email.toLowerCase()
      if (!mentionMap.has(email)) {
        mentionMap.set(email, new Set())
      }
      mentionMap.get(email)!.add(mention.event_id)
    })
    
    // Fetch events for this week
    const { data: thisWeekEvents, error: thisWeekError } = await supabase
      .from('ops_events')
      .select('id, title, start_date, start_time, end_time, location, needs_program_director, needs_office, needs_it, needs_security, needs_facilities')
      .gte('start_date', thisWeekStart)
      .lte('start_date', thisWeekEnd)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (thisWeekError) {
      console.error('[Weekly Digest] Error fetching this week events:', thisWeekError)
    }
    
    // Fetch events for looking ahead
    const { data: lookAheadEvents, error: lookAheadError } = await supabase
      .from('ops_events')
      .select('id, title, start_date, start_time, end_time, location, needs_program_director, needs_office, needs_it, needs_security, needs_facilities')
      .gte('start_date', lookAheadStart)
      .lte('start_date', lookAheadEnd)
      .eq('is_hidden', false)
      .neq('status', 'cancelled')
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })
    
    if (lookAheadError) {
      console.error('[Weekly Digest] Error fetching look ahead events:', lookAheadError)
    }
    
    // Get subscriptions for all users
    const { data: subscriptions } = await supabase
      .from('event_subscriptions')
      .select('event_id, user_email')
    
    const subscriptionMap = new Map<string, Set<string>>()
    subscriptions?.forEach(sub => {
      if (!subscriptionMap.has(sub.user_email)) {
        subscriptionMap.set(sub.user_email, new Set())
      }
      subscriptionMap.get(sub.user_email)!.add(sub.event_id)
    })
    
    // Process each user
    const results = await Promise.all(
      users.map(async (user) => {
        try {
          // Filter events relevant to this user
          const userTeams = (user.teams || []) as TeamType[]
          const userSubscriptions = subscriptionMap.get(user.email) || new Set()
          const userMentions = mentionMap.get(user.email.toLowerCase()) || new Set()
          
          // Function to check if event is relevant to user
          const isRelevantEvent = (event: any) => {
            // Check if user's team is assigned
            for (const team of userTeams) {
              const needsKey = TEAM_NEEDS_KEYS[team]
              if (event[needsKey]) return true
            }
            
            // Check if user was mentioned in this event
            if (userMentions.has(event.id)) return true
            
            // Check if user is subscribed
            return userSubscriptions.has(event.id)
          }
          
          // Function to get team labels for an event
          const getEventTeams = (event: any): string[] => {
            const teams: string[] = []
            if (event.needs_program_director) teams.push(getTeamDisplayName('program_director'))
            if (event.needs_office) teams.push(getTeamDisplayName('office'))
            if (event.needs_it) teams.push(getTeamDisplayName('it'))
            if (event.needs_security) teams.push(getTeamDisplayName('security'))
            if (event.needs_facilities) teams.push(getTeamDisplayName('facilities'))
            return teams
          }
          
          // Filter and format events
          const userThisWeek = (thisWeekEvents || [])
            .filter(isRelevantEvent)
            .map(e => ({
              id: e.id,
              title: e.title,
              start_date: e.start_date,
              start_time: e.start_time,
              end_time: e.end_time,
              location: e.location,
              teams: getEventTeams(e),
            }))
          
          const userLookAhead = (lookAheadEvents || [])
            .filter(isRelevantEvent)
            .map(e => ({
              id: e.id,
              title: e.title,
              start_date: e.start_date,
              start_time: e.start_time,
              end_time: e.end_time,
              location: e.location,
              teams: getEventTeams(e),
            }))
          
          // Skip if no events for this user
          if (userThisWeek.length === 0 && userLookAhead.length === 0) {
            console.log(`[Weekly Digest] Skipping ${user.email} - no relevant events`)
            return { email: user.email, sent: false, reason: 'no_events' }
          }
          
          // Build and send email
          const html = buildWeeklyDigestEmail(
            user.name || '',
            userThisWeek,
            userLookAhead,
            monday,
            sunday
          )
          
          const result = await sendEmail({
            to: [{ email: user.email, name: user.name || undefined }],
            subject: `[Ops] Weekly Digest - ${thisWeekStart}`,
            html,
          })
          
          if (result.success) {
            console.log(`[Weekly Digest] Sent to ${user.email} (${userThisWeek.length} this week, ${userLookAhead.length} ahead)`)
            return { email: user.email, sent: true, thisWeek: userThisWeek.length, lookAhead: userLookAhead.length }
          } else {
            console.error(`[Weekly Digest] Failed to send to ${user.email}:`, result.error)
            return { email: user.email, sent: false, error: result.error }
          }
          
        } catch (err: any) {
          console.error(`[Weekly Digest] Error processing ${user.email}:`, err)
          return { email: user.email, sent: false, error: err.message }
        }
      })
    )
    
    const sent = results.filter(r => r.sent).length
    const skipped = results.filter(r => !r.sent && r.reason === 'no_events').length
    const failed = results.filter(r => !r.sent && r.reason !== 'no_events').length
    
    console.log(`[Weekly Digest] Complete: ${sent} sent, ${skipped} skipped, ${failed} failed`)
    
    return NextResponse.json({
      success: true,
      sent,
      skipped,
      failed,
      details: results,
    })
    
  } catch (error: any) {
    console.error('[Weekly Digest] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// Also allow POST for manual triggering
export async function POST(request: Request) {
  return GET(request)
}
