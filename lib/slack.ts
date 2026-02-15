/**
 * Slack Integration Utilities
 * 
 * Uses Slack Web API to send notifications when users are @mentioned in notes.
 * Requires SLACK_BOT_TOKEN environment variable.
 */

const SLACK_API_BASE = 'https://slack.com/api'

interface SlackUser {
  id: string
  name: string
  real_name: string
  profile: {
    email: string
    display_name: string
    real_name: string
  }
}

interface SlackResponse {
  ok: boolean
  error?: string
  user?: SlackUser
  channel?: {
    id: string
  }
  ts?: string
}

/**
 * Look up a Slack user by their email address
 */
export async function lookupSlackUserByEmail(email: string): Promise<SlackUser | null> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    console.error('[Slack] SLACK_BOT_TOKEN not configured')
    return null
  }

  console.log(`[Slack] Looking up user by email: ${email}`)
  console.log(`[Slack] Token starts with: ${token.substring(0, 10)}...`)

  try {
    const url = `${SLACK_API_BASE}/users.lookupByEmail?email=${encodeURIComponent(email)}`
    console.log(`[Slack] Fetching: ${url}`)
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const data: SlackResponse = await response.json()
    console.log(`[Slack] API Response:`, JSON.stringify(data, null, 2))
    
    if (!data.ok) {
      if (data.error === 'users_not_found') {
        console.log(`[Slack] User not found for email: ${email}`)
      } else {
        console.error(`[Slack] lookupByEmail error: ${data.error}`)
      }
      return null
    }

    console.log(`[Slack] Found user: ${data.user?.real_name} (${data.user?.id})`)
    return data.user || null
  } catch (error) {
    console.error('[Slack] lookupByEmail failed:', error)
    return null
  }
}

/**
 * Open a DM conversation with a Slack user
 */
async function openDMConversation(userId: string): Promise<string | null> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) return null

  console.log(`[Slack] Opening DM conversation with user: ${userId}`)

  try {
    const response = await fetch(`${SLACK_API_BASE}/conversations.open`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ users: userId }),
    })

    const data: SlackResponse = await response.json()
    console.log(`[Slack] conversations.open response:`, JSON.stringify(data, null, 2))
    
    if (!data.ok) {
      console.error(`[Slack] conversations.open error: ${data.error}`)
      return null
    }

    console.log(`[Slack] DM channel opened: ${data.channel?.id}`)
    return data.channel?.id || null
  } catch (error) {
    console.error('[Slack] conversations.open failed:', error)
    return null
  }
}

/**
 * Send a direct message to a Slack user
 */
export async function sendSlackDM(
  userId: string,
  message: string,
  blocks?: any[]
): Promise<boolean> {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) {
    console.error('[Slack] SLACK_BOT_TOKEN not configured')
    return false
  }

  console.log(`[Slack] sendSlackDM to user: ${userId}`)

  try {
    // Open DM conversation first
    const channelId = await openDMConversation(userId)
    if (!channelId) {
      console.error(`[Slack] Could not open DM with user ${userId}`)
      return false
    }

    const body: any = {
      channel: channelId,
      text: message,
    }

    if (blocks) {
      body.blocks = blocks
    }

    console.log(`[Slack] Sending message to channel: ${channelId}`)

    const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const data: SlackResponse = await response.json()
    console.log(`[Slack] chat.postMessage response:`, JSON.stringify(data, null, 2))
    
    if (!data.ok) {
      console.error(`[Slack] chat.postMessage error: ${data.error}`)
      return false
    }

    console.log(`[Slack] Message sent successfully!`)
    return true
  } catch (error) {
    console.error('[Slack] sendDM failed:', error)
    return false
  }
}

/**
 * Send a mention notification to a user via Slack
 */
export async function sendMentionNotification({
  mentionedEmail,
  mentionedBy,
  eventTitle,
  eventDate,
  eventLocation,
  noteContent,
  eventUrl,
}: {
  mentionedEmail: string
  mentionedBy: string
  eventTitle: string
  eventDate: string
  eventLocation?: string
  noteContent: string
  eventUrl: string
}): Promise<{ success: boolean; error?: string }> {
  // Look up the Slack user
  const slackUser = await lookupSlackUserByEmail(mentionedEmail)
  if (!slackUser) {
    return { 
      success: false, 
      error: `Slack user not found for ${mentionedEmail}` 
    }
  }

  // Build the message with blocks for rich formatting
  const message = `You were mentioned by ${mentionedBy} in an event note`
  
  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔔 You were mentioned in an event note*`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Event:*\n${eventTitle}`,
        },
        {
          type: 'mrkdwn',
          text: `*Date:*\n${eventDate}`,
        },
      ],
    },
  ]

  // Add location if present
  if (eventLocation) {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Location:*\n${eventLocation}`,
        },
        {
          type: 'mrkdwn',
          text: `*Mentioned by:*\n${mentionedBy}`,
        },
      ],
    })
  } else {
    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Mentioned by:*\n${mentionedBy}`,
        },
      ],
    })
  }

  // Add the note content (clean up mention format for display)
  const cleanedNote = noteContent
    .replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1')  // @[Name](email) -> @Name
    .replace(/\n/g, '\n>')
  
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `*Note:*\n>${cleanedNote}`,
    },
  })

  // Add action button
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: '📋 View Event',
          emoji: true,
        },
        url: eventUrl,
        action_id: 'view_event',
      },
    ],
  })

  const success = await sendSlackDM(slackUser.id, message, blocks)
  
  return { success }
}

/**
 * Parse @mentions from text content
 * Supports formats like @john.doe@shefaschool.org or @John Doe
 */
export function parseMentions(text: string): string[] {
  if (!text) return []
  
  // Match @email format (e.g., @john.doe@shefaschool.org)
  const emailPattern = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
  const emailMatches = [...text.matchAll(emailPattern)].map(m => m[1])
  
  // Match @[Name] format for display names (e.g., @[John Doe])
  const bracketPattern = /@\[([^\]]+)\]/g
  const bracketMatches = [...text.matchAll(bracketPattern)].map(m => m[1])
  
  return [...new Set([...emailMatches, ...bracketMatches])]
}

/**
 * Check if Slack integration is configured
 */
export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN
}
