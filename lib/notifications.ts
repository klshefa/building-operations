import { OpsEvent, TeamType } from './types'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ops.shefaschool.org'

export interface NotificationRecipient {
  email: string
  name?: string
}

export interface SendEmailOptions {
  to: NotificationRecipient[]
  subject: string
  html: string
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string; id?: string }> {
  if (!RESEND_API_KEY) {
    console.error('[Email] RESEND_API_KEY not configured')
    return { success: false, error: 'Email service not configured' }
  }

  try {
    console.log(`[Email] Sending to: ${options.to.map(r => r.email).join(', ')}`)
    console.log(`[Email] Subject: ${options.subject}`)
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Building Operations <ops@shefaschool.org>',
        to: options.to.map(r => r.email),
        subject: options.subject,
        html: options.html
      })
    })

    const data = await response.json()
    console.log(`[Email] Resend response:`, JSON.stringify(data))

    if (!response.ok) {
      console.error(`[Email] Resend error: ${response.status}`, data)
      return { success: false, error: data.message || JSON.stringify(data) }
    }

    console.log(`[Email] Successfully sent, id: ${data.id}`)
    return { success: true, id: data.id }
  } catch (err: any) {
    console.error('[Email] Exception:', err)
    return { success: false, error: err.message }
  }
}

export function formatEventDate(event: OpsEvent): string {
  const date = new Date(event.start_date)
  const options: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }
  let result = date.toLocaleDateString('en-US', options)
  
  if (event.start_time) {
    result += ` at ${formatTime(event.start_time)}`
  }
  if (event.end_time) {
    result += ` - ${formatTime(event.end_time)}`
  }
  
  return result
}

function formatTime(time: string | null | undefined): string {
  if (!time) return ''
  
  // Handle various time formats: "14:00", "14:00:00", "2:00 PM", etc.
  const parts = time.split(':')
  if (parts.length < 2) return time // Return as-is if can't parse
  
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  
  if (isNaN(h) || isNaN(m)) return time // Return as-is if can't parse
  
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

export function getTeamDisplayName(team: TeamType): string {
  const names: Record<TeamType, string> = {
    program_director: 'Program Director',
    office: 'Office',
    it: 'IT',
    security: 'Security',
    facilities: 'Facilities'
  }
  return names[team] || team
}

export function buildTeamAssignmentEmail(event: OpsEvent, team: TeamType): string {
  const teamName = getTeamDisplayName(team)
  const eventUrl = `${APP_URL}/event/${event.id}`
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #164a7a; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Team Assignment</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Building Operations</p>
        </div>
        
        <div style="padding: 24px;">
          <div style="background: #dbeafe; border: 1px solid #93c5fd; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #1e40af; font-weight: 500;">
              📋 The <strong>${teamName}</strong> team has been assigned to an event
            </p>
          </div>
          
          <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px;">${event.title}</h2>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 100px;">Date</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${formatEventDate(event)}</td>
            </tr>
            ${event.location ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Location</td>
              <td style="padding: 8px 0; color: #1e293b;">${event.location}</td>
            </tr>
            ` : ''}
            ${event.description ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b; vertical-align: top;">Details</td>
              <td style="padding: 8px 0; color: #1e293b;">${event.description}</td>
            </tr>
            ` : ''}
          </table>
          
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${eventUrl}" style="display: inline-block; background: #164a7a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              View Event Details
            </a>
          </div>
        </div>
        
        <div style="background: #f1f5f9; padding: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            You received this because you're on the ${teamName} team.<br>
            <a href="${APP_URL}" style="color: #164a7a;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

export interface DigestEvent {
  id: string
  title: string
  start_date: string
  start_time?: string
  end_time?: string
  location?: string
  teams: string[]
}

export function buildWeeklyDigestEmail(
  userName: string,
  thisWeekEvents: DigestEvent[],
  lookingAheadEvents: DigestEvent[],
  weekStart: Date,
  weekEnd: Date
): string {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  
  const formatEventRow = (event: DigestEvent) => {
    const time = event.start_time 
      ? `${formatTime(event.start_time)}${event.end_time ? ` - ${formatTime(event.end_time)}` : ''}`
      : 'All Day'
    const teams = event.teams.length > 0 
      ? event.teams.map(t => `<span style="display:inline-block;background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:4px;font-size:11px;margin-right:4px;">${t}</span>`).join('')
      : ''
    
    return `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
          <a href="${APP_URL}/event/${event.id}" style="color: #1e40af; text-decoration: none; font-weight: 500;">${event.title}</a>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">
            ${formatDate(event.start_date)} • ${time}
            ${event.location ? ` • ${event.location}` : ''}
          </div>
          ${teams ? `<div style="margin-top: 6px;">${teams}</div>` : ''}
        </td>
      </tr>
    `
  }
  
  const weekStartStr = weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  const weekEndStr = weekEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  
  const thisWeekHtml = thisWeekEvents.length > 0
    ? thisWeekEvents.map(formatEventRow).join('')
    : '<tr><td style="padding: 16px; color: #64748b; text-align: center;">No events this week</td></tr>'
    
  const lookingAheadHtml = lookingAheadEvents.length > 0
    ? lookingAheadEvents.map(formatEventRow).join('')
    : '<tr><td style="padding: 16px; color: #64748b; text-align: center;">No upcoming events</td></tr>'

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #164a7a; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Weekly Digest</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Building Operations</p>
        </div>
        
        <div style="padding: 24px;">
          <p style="margin: 0 0 20px; color: #475569;">
            Good morning${userName ? `, ${userName}` : ''}! Here's your weekly ops overview.
          </p>
          
          <!-- This Week Section -->
          <div style="margin-bottom: 32px;">
            <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; display: flex; align-items: center;">
              <span style="background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 6px; margin-right: 12px;">📅</span>
              This Week
            </h2>
            <p style="margin: 0 0 12px; font-size: 14px; color: #64748b;">
              ${weekStartStr} - ${weekEndStr}
            </p>
            <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
              ${thisWeekHtml}
            </table>
          </div>
          
          <!-- Looking Ahead Section -->
          <div>
            <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 18px; display: flex; align-items: center;">
              <span style="background: #fef3c7; color: #92400e; padding: 4px 12px; border-radius: 6px; margin-right: 12px;">🔮</span>
              Looking Ahead
            </h2>
            <p style="margin: 0 0 12px; font-size: 14px; color: #64748b;">
              Next 2-3 weeks
            </p>
            <table style="width: 100%; border-collapse: collapse; background: #f8fafc; border-radius: 8px; overflow: hidden;">
              ${lookingAheadHtml}
            </table>
          </div>
          
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${APP_URL}" style="display: inline-block; background: #164a7a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              View All Events
            </a>
          </div>
        </div>
        
        <div style="background: #f1f5f9; padding: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            You're receiving this because you're part of the ops team.<br>
            <a href="${APP_URL}/admin" style="color: #164a7a;">Manage notification preferences</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}

export function buildEventUpdateEmail(event: OpsEvent, changes: string[], subscriberName?: string): string {
  const eventUrl = `${APP_URL}/event/${event.id}`
  
  const changesHtml = changes.map(change => `
    <li style="padding: 4px 0; color: #475569;">${change}</li>
  `).join('')
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        <div style="background: #164a7a; color: white; padding: 24px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">Event Updated</h1>
          <p style="margin: 8px 0 0; opacity: 0.8;">Building Operations</p>
        </div>
        
        <div style="padding: 24px;">
          ${subscriberName ? `<p style="margin: 0 0 16px; color: #64748b;">Hi ${subscriberName},</p>` : ''}
          
          <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e; font-weight: 500;">
              🔔 An event you're subscribed to has been updated
            </p>
          </div>
          
          <h2 style="margin: 0 0 16px; color: #1e293b; font-size: 20px;">${event.title}</h2>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 100px;">Date</td>
              <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${formatEventDate(event)}</td>
            </tr>
            ${event.location ? `
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Location</td>
              <td style="padding: 8px 0; color: #1e293b;">${event.location}</td>
            </tr>
            ` : ''}
          </table>
          
          <div style="background: #f8fafc; border-radius: 8px; padding: 16px;">
            <h3 style="margin: 0 0 12px; color: #1e293b; font-size: 14px;">Changes Made:</h3>
            <ul style="margin: 0; padding-left: 20px;">
              ${changesHtml}
            </ul>
          </div>
          
          <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center;">
            <a href="${eventUrl}" style="display: inline-block; background: #164a7a; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              View Event Details
            </a>
          </div>
        </div>
        
        <div style="background: #f1f5f9; padding: 16px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #64748b;">
            You received this because you're subscribed to this event.<br>
            <a href="${eventUrl}" style="color: #164a7a;">Unsubscribe from this event</a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `
}
