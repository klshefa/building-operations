'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import type { OpsEvent, EventSource, EventType } from '@/lib/types'
import {
  ArrowLeftIcon,
  MapPinIcon,
  ClockIcon,
  UsersIcon,
  CalendarIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  CakeIcon,
  DocumentTextIcon,
  BellIcon,
  BellSlashIcon,
} from '@heroicons/react/24/outline'
import { AvailabilityCheck } from '@/components/AvailabilityCheck'
import { RelatedEvents } from '@/components/RelatedEvents'
import { ResourceScheduleSidebar } from '@/components/ResourceScheduleSidebar'
import { MentionInput, parseMentionEmails } from '@/components/MentionInput'

const sourceLabels: Record<EventSource, string> = {
  bigquery_group: 'VC Event',
  bigquery_resource: 'VC Resource',
  calendar_staff: 'Staff Cal',
  calendar_ls: 'LS Cal',
  calendar_ms: 'MS Cal',
  manual: 'Manual',
}

const sourceColors: Record<EventSource, string> = {
  bigquery_group: 'bg-purple-100 text-purple-700',
  bigquery_resource: 'bg-blue-100 text-blue-700',
  calendar_staff: 'bg-green-100 text-green-700',
  calendar_ls: 'bg-orange-100 text-orange-700',
  calendar_ms: 'bg-teal-100 text-teal-700',
  manual: 'bg-slate-100 text-slate-700',
}

const eventTypes: { value: EventType; label: string }[] = [
  { value: 'program_event', label: 'Program Event' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'assembly', label: 'Assembly' },
  { value: 'field_trip', label: 'Field Trip' },
  { value: 'performance', label: 'Performance' },
  { value: 'athletic', label: 'Athletic' },
  { value: 'parent_event', label: 'Parent Event' },
  { value: 'professional_development', label: 'Professional Development' },
  { value: 'religious_observance', label: 'Religious Observance' },
  { value: 'fundraiser', label: 'Fundraiser' },
  { value: 'other', label: 'Other' },
]

interface TeamSection {
  id: string
  title: string
  shortTitle: string
  icon: React.ElementType
  needsKey: keyof OpsEvent
  notesKey: keyof OpsEvent
  color: string
  bgColor: string
  borderColor: string
  extraFields?: { key: keyof OpsEvent; label: string; type: 'text' | 'number' | 'textarea' | 'checkbox' }[]
}

const teamSections: TeamSection[] = [
  {
    id: 'program',
    title: 'Program Director',
    shortTitle: 'Program',
    icon: UserGroupIcon,
    needsKey: 'needs_program_director',
    notesKey: 'program_director_notes',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    borderColor: 'border-indigo-500',
  },
  {
    id: 'office',
    title: 'Office',
    shortTitle: 'Office',
    icon: BuildingOfficeIcon,
    needsKey: 'needs_office',
    notesKey: 'office_notes',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
    borderColor: 'border-pink-500',
  },
  {
    id: 'it',
    title: 'IT / A/V',
    shortTitle: 'IT',
    icon: ComputerDesktopIcon,
    needsKey: 'needs_it',
    notesKey: 'it_notes',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    borderColor: 'border-cyan-500',
    extraFields: [
      { key: 'techs_needed', label: 'Techs Needed', type: 'number' },
      { key: 'av_equipment', label: 'A/V Equipment', type: 'text' },
      { key: 'tech_notes', label: 'Tech Notes', type: 'textarea' },
    ],
  },
  {
    id: 'security',
    title: 'Security',
    shortTitle: 'Security',
    icon: ShieldCheckIcon,
    needsKey: 'needs_security',
    notesKey: 'security_notes',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-500',
    extraFields: [
      { key: 'security_personnel_needed', label: 'Personnel Needed', type: 'number' },
      { key: 'building_open', label: 'Building Open After Hours', type: 'checkbox' },
      { key: 'elevator_notes', label: 'Elevator Notes', type: 'textarea' },
    ],
  },
  {
    id: 'facilities',
    title: 'Facilities',
    shortTitle: 'Facilities',
    icon: WrenchScrewdriverIcon,
    needsKey: 'needs_facilities',
    notesKey: 'facilities_notes',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-500',
    extraFields: [
      { key: 'setup_instructions', label: 'Setup Instructions', type: 'textarea' },
    ],
  },
]

// Clean location string - remove numeric prefixes like "2 Music Room" -> "Music Room"
function cleanLocation(location: string | null | undefined): string {
  if (!location) return ''
  // Remove leading numbers and spaces (e.g., "2 Music Room" -> "Music Room")
  return location.replace(/^\d+\s*/, '').trim()
}

// Convert time from various formats to HH:MM for input[type="time"]
function toTimeInputFormat(time: string | null | undefined): string {
  if (!time) return ''
  
  // If already in HH:MM format, return as-is
  if (/^\d{2}:\d{2}$/.test(time)) return time
  
  // Handle "9:00 am", "10:30 pm", etc.
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i)
  if (match) {
    let hours = parseInt(match[1])
    const minutes = match[2]
    const period = match[3]?.toLowerCase()
    
    if (period === 'pm' && hours !== 12) hours += 12
    if (period === 'am' && hours === 12) hours = 0
    
    return `${hours.toString().padStart(2, '0')}:${minutes}`
  }
  
  // Handle HH:MM:SS format
  const hmsMatch = time.match(/^(\d{2}):(\d{2}):\d{2}$/)
  if (hmsMatch) {
    return `${hmsMatch[1]}:${hmsMatch[2]}`
  }
  
  return time
}

export default function EventDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [event, setEvent] = useState<OpsEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [hasChanges, setHasChanges] = useState(false)
  const [activeTeamTab, setActiveTeamTab] = useState<string | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [subscribing, setSubscribing] = useState(false)
  const [conflictingEvents, setConflictingEvents] = useState<OpsEvent[]>([])
  
  // Resource dropdown for location
  const [resources, setResources] = useState<{ id: number; description: string }[]>([])
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null)
  
  // Track initial mentions to detect new ones on save
  const [initialMentions, setInitialMentions] = useState<Record<string, string[]>>({})
  const [currentUser, setCurrentUser] = useState<{ email: string } | null>(null)

  useEffect(() => {
    fetchEvent()
    fetchResources()
  }, [params.id])

  // Resolve resource ID from location when event or resources change
  useEffect(() => {
    if (!event?.location || resources.length === 0) {
      setSelectedResourceId(null)
      return
    }
    const loc = cleanLocation(event.location).toLowerCase()
    const match = resources.find(r => 
      r.description.toLowerCase() === loc ||
      r.description.toLowerCase().includes(loc) ||
      loc.includes(r.description.toLowerCase())
    )
    setSelectedResourceId(match?.id || null)
  }, [event?.location, resources])

  async function fetchResources() {
    try {
      const response = await fetch('/api/resources')
      const { data } = await response.json()
      if (data) {
        setResources(data)
      }
    } catch (err) {
      console.error('Error fetching resources:', err)
    }
  }

  // Check subscription status when event is loaded
  useEffect(() => {
    if (params.id) {
      checkSubscription()
    }
  }, [params.id])

  async function checkSubscription() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email
    
    if (!email) return
    
    try {
      const response = await fetch(`/api/events/${params.id}/subscribe?email=${encodeURIComponent(email)}`)
      const result = await response.json()
      setSubscribed(result.subscribed)
    } catch (error) {
      console.error('Error checking subscription:', error)
    }
  }

  async function toggleSubscription() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    const email = session?.user?.email
    const name = session?.user?.user_metadata?.full_name
    
    if (!email) return
    
    setSubscribing(true)
    try {
      if (subscribed) {
        // Unsubscribe
        const response = await fetch(`/api/events/${params.id}/subscribe?email=${encodeURIComponent(email)}`, {
          method: 'DELETE'
        })
        const result = await response.json()
        if (result.success) {
          setSubscribed(false)
        }
      } else {
        // Subscribe
        const response = await fetch(`/api/events/${params.id}/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            email: email, 
            name: name || email 
          })
        })
        const result = await response.json()
        if (result.success) {
          setSubscribed(true)
        }
      }
    } catch (error) {
      console.error('Error toggling subscription:', error)
    } finally {
      setSubscribing(false)
    }
  }

  async function fetchEvent() {
    try {
      const response = await fetch(`/api/events/${params.id}`)
      const result = await response.json()
      
      if (result.error) {
        console.error('Error fetching event:', result.error)
        return
      }
      
      setEvent(result.data)
      
      // Track initial mentions for each notes field
      const mentions: Record<string, string[]> = {}
      mentions['general_notes'] = parseMentionEmails(result.data.general_notes || '')
      teamSections.forEach(section => {
        mentions[section.notesKey] = parseMentionEmails(result.data[section.notesKey] || '')
      })
      setInitialMentions(mentions)
      
      // Set active tab to first assigned team
      const firstAssigned = teamSections.find(s => result.data[s.needsKey])
      if (firstAssigned) {
        setActiveTeamTab(firstAssigned.id)
      }
      
      // Always check for conflicts based on location/time overlap
      fetchConflictingEvents(result.data)
      
      // Get current user email
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.email) {
        setCurrentUser({ email: session.user.email })
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  async function fetchConflictingEvents(eventData: OpsEvent) {
    try {
      // Fetch all events on same date
      const response = await fetch(`/api/events?startDate=${eventData.start_date}&endDate=${eventData.start_date}&hideHidden=false`)
      const result = await response.json()
      
      if (result.data) {
        // Find ACTUAL conflicts: same location AND overlapping time
        const conflicts = result.data.filter((e: OpsEvent) => {
          if (e.id === eventData.id) return false
          
          // Must have same location
          const thisLoc = cleanLocation(eventData.location)?.toLowerCase().trim()
          const otherLoc = cleanLocation(e.location)?.toLowerCase().trim()
          if (!thisLoc || !otherLoc || thisLoc !== otherLoc) return false
          
          // Must have overlapping times
          if (!eventData.start_time || !e.start_time) return false
          
          const thisStart = eventData.start_time.replace(':', '')
          const thisEnd = (eventData.end_time || '23:59').replace(':', '')
          const otherStart = e.start_time.replace(':', '')
          const otherEnd = (e.end_time || '23:59').replace(':', '')
          
          // Check overlap: NOT (one ends before other starts)
          const noOverlap = thisEnd <= otherStart || otherEnd <= thisStart
          return !noOverlap
        })
        
        setConflictingEvents(conflicts)
      }
    } catch (error) {
      console.error('Error fetching conflicts:', error)
    }
  }

  function updateField(key: keyof OpsEvent, value: any) {
    if (!event) return
    setEvent({ ...event, [key]: value })
    setHasChanges(true)
    setSaveStatus('idle')
  }

  function toggleTeam(sectionId: string) {
    if (!event) return
    const section = teamSections.find(s => s.id === sectionId)
    if (!section) return
    
    const isCurrentlyAssigned = event[section.needsKey] as boolean
    updateField(section.needsKey, !isCurrentlyAssigned)
    
    // If assigning, switch to that tab
    if (!isCurrentlyAssigned) {
      setActiveTeamTab(sectionId)
    } else if (activeTeamTab === sectionId) {
      // If unassigning the active tab, switch to another assigned team
      const otherAssigned = teamSections.find(s => s.id !== sectionId && event[s.needsKey])
      setActiveTeamTab(otherAssigned?.id || null)
    }
  }

  async function saveEvent() {
    if (!event) return
    
    setSaving(true)
    setSaveStatus('idle')
    
    try {
      const response = await fetch(`/api/events/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      })
      
      const result = await response.json()
      
      if (result.error) {
        setSaveStatus('error')
        console.error('Error saving:', result.error)
      } else {
        setSaveStatus('success')
        setHasChanges(false)
        
        // Check for new mentions and send Slack notifications
        if (currentUser?.email) {
          await sendNewMentionNotifications()
        }
        
        // Update initial mentions to current state
        const mentions: Record<string, string[]> = {}
        mentions['general_notes'] = parseMentionEmails(event.general_notes || '')
        teamSections.forEach(section => {
          mentions[section.notesKey] = parseMentionEmails((event as any)[section.notesKey] || '')
        })
        setInitialMentions(mentions)
        
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (error) {
      setSaveStatus('error')
      console.error('Error:', error)
    } finally {
      setSaving(false)
    }
  }
  
  // Send Slack notifications for new mentions
  async function sendNewMentionNotifications() {
    if (!event || !currentUser?.email) {
      console.log('[Mentions] No event or user, skipping notifications')
      return
    }
    
    // Check each notes field for new mentions
    const noteFields = [
      { key: 'general_notes', type: 'general' },
      ...teamSections.map(s => ({ key: s.notesKey, type: s.id }))
    ]
    
    for (const field of noteFields) {
      const currentMentions = parseMentionEmails((event as any)[field.key] || '')
      const prevMentions = initialMentions[field.key] || []
      
      // Find new mentions (in current but not in previous)
      const newMentions = currentMentions.filter(email => !prevMentions.includes(email))
      
      console.log(`[Mentions] Field ${field.key}: current=${currentMentions.join(',')}, prev=${prevMentions.join(',')}, new=${newMentions.join(',')}`)
      
      if (newMentions.length > 0) {
        try {
          console.log(`[Mentions] Sending notification for ${newMentions.length} new mentions`)
          const response = await fetch('/api/slack/send-mention', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              eventId: event.id,
              noteType: field.type,
              noteContent: (event as any)[field.key] || '',
              mentionedEmails: newMentions,
              mentionedByEmail: currentUser.email,
            }),
          })
          const result = await response.json()
          console.log('[Mentions] Slack API response:', result)
          
          if (!result.success) {
            console.error('[Mentions] Failed:', result.error)
          }
        } catch (err) {
          console.error('Failed to send mention notifications:', err)
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-shefa-blue-500 border-t-transparent"></div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Event Not Found</h1>
          <button
            onClick={() => router.back()}
            className="text-shefa-blue-600 hover:text-shefa-blue-700"
          >
            ← Go Back
          </button>
        </div>
      </div>
    )
  }

  const startDate = parseISO(event.start_date)
  const uniqueSources = [...new Set(event.sources?.length > 0 ? event.sources : [event.primary_source])]
  const assignedTeams = teamSections.filter(s => event[s.needsKey])
  const activeSection = teamSections.find(s => s.id === activeTeamTab)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5" />
              <span>Back</span>
            </button>
            
            <div className="flex items-center gap-3">
              {saveStatus === 'success' && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <CheckIcon className="w-4 h-4" />
                  Saved
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-sm text-red-600">Save failed</span>
              )}
              
              {/* Subscribe button */}
              <button
                onClick={toggleSubscription}
                disabled={subscribing}
                title={subscribed ? 'Unsubscribe from notifications' : 'Subscribe to get notifications when this event changes'}
                className={`p-2 rounded-lg border transition-all ${
                  subscribed
                    ? 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {subscribing ? (
                  <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : subscribed ? (
                  <BellIcon className="w-5 h-5 fill-current" />
                ) : (
                  <BellIcon className="w-5 h-5" />
                )}
              </button>
              
              {!(event as any)?._vcReadOnly && (
                <button
                  onClick={saveEvent}
                  disabled={saving || !hasChanges}
                  className={`px-4 py-2 rounded-lg font-medium transition-all ${
                    hasChanges
                      ? 'bg-shefa-blue-600 text-white hover:bg-shefa-blue-700'
                      : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Veracross-only reservation banner */}
        {(event as any)._vcReadOnly && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-800">Veracross Reservation (Read-Only)</h3>
                <p className="text-sm text-amber-700 mt-1">
                  This reservation exists in Veracross but hasn't been synced to Building Operations yet. 
                  You can view the details but cannot edit team assignments or add notes.
                </p>
                <p className="text-sm text-amber-600 mt-2">
                  To manage this event, run a data sync from Admin → Data Sync → Resources to import it.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Left Column */}
          <div className="lg:col-span-2 space-y-6">
        {/* Event Header Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-slate-200 p-6"
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {uniqueSources.map((source) => (
                  <span key={source} className={`text-xs px-2 py-1 rounded-full font-medium ${sourceColors[source]}`}>
                    {sourceLabels[source]}
                  </span>
                ))}
                {event.is_hidden && (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-600 flex items-center gap-1">
                    <EyeSlashIcon className="w-3 h-3" />
                    Hidden
                  </span>
                )}
                {conflictingEvents.length > 0 && !event.conflict_ok && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                    <ExclamationTriangleIcon className="w-3 h-3" />
                    Conflict
                  </span>
                )}
                {(event as any)._vcReadOnly && (
                  <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                    Read-only (Veracross)
                  </span>
                )}
              </div>
              
              {(event as any)._vcReadOnly ? (
                <h1 className="text-2xl font-bold text-slate-800">{event.title}</h1>
              ) : (
                <input
                  type="text"
                  value={event.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className="text-2xl font-bold text-slate-800 w-full border-0 border-b-2 border-transparent hover:border-slate-200 focus:border-shefa-blue-500 focus:outline-none transition-colors bg-transparent"
                />
              )}
              
              {(event as any)._vcReadOnly ? (
                event.description && <p className="mt-2 text-slate-600">{event.description}</p>
              ) : (
                <textarea
                  value={event.description || ''}
                  onChange={(e) => updateField('description', e.target.value)}
                  placeholder="Add a description..."
                  rows={2}
                  className="mt-2 text-slate-600 w-full border-0 border-b-2 border-transparent hover:border-slate-200 focus:border-shefa-blue-500 focus:outline-none transition-colors bg-transparent resize-none"
                />
              )}
              
              {/* Team indicators at top */}
              {assignedTeams.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {event.needs_program_director && (
                    <span className="text-xs px-2 py-1 rounded-full bg-indigo-100 text-indigo-700 flex items-center gap-1">
                      <UserGroupIcon className="w-3 h-3" />
                      Program
                    </span>
                  )}
                  {event.needs_office && (
                    <span className="text-xs px-2 py-1 rounded-full bg-pink-100 text-pink-700 flex items-center gap-1">
                      <BuildingOfficeIcon className="w-3 h-3" />
                      Office
                    </span>
                  )}
                  {event.needs_it && (
                    <span className="text-xs px-2 py-1 rounded-full bg-cyan-100 text-cyan-700 flex items-center gap-1">
                      <ComputerDesktopIcon className="w-3 h-3" />
                      IT
                    </span>
                  )}
                  {event.needs_security && (
                    <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 flex items-center gap-1">
                      <ShieldCheckIcon className="w-3 h-3" />
                      Security
                    </span>
                  )}
                  {event.needs_facilities && (
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                      <WrenchScrewdriverIcon className="w-3 h-3" />
                      Facilities
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <div className="text-center bg-shefa-blue-50 rounded-lg px-4 py-3 shrink-0">
              <div className="text-3xl font-bold text-shefa-blue-600">
                {format(startDate, 'd')}
              </div>
              <div className="text-sm text-shefa-blue-500 uppercase font-medium">
                {format(startDate, 'MMM')}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {format(startDate, 'yyyy')}
              </div>
            </div>
          </div>

          {/* Quick Info - 2 rows */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            {/* Row 1: Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1 mb-1">
                  <CalendarIcon className="w-3 h-3" />
                  Date
                </label>
                <input
                  type="date"
                  value={event.start_date}
                  onChange={(e) => updateField('start_date', e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1 mb-1">
                  <ClockIcon className="w-3 h-3" />
                  Time
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={toTimeInputFormat(event.start_time)}
                    onChange={(e) => updateField('start_time', e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
                  />
                  <span className="text-slate-400">-</span>
                  <input
                    type="time"
                    value={toTimeInputFormat(event.end_time)}
                    onChange={(e) => updateField('end_time', e.target.value)}
                    className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
            
            {/* Row 2: Location and Type */}
            <div className="grid grid-cols-2 gap-4">
              <div className="relative">
                <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1 mb-1">
                  <MapPinIcon className="w-3 h-3" />
                  Location
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={cleanLocation(event.location)}
                    onChange={(e) => {
                      updateField('location', e.target.value)
                      setShowLocationDropdown(true)
                    }}
                    onFocus={() => setShowLocationDropdown(true)}
                    placeholder="Type to search..."
                    className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 pr-8 focus:border-shefa-blue-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                    disabled={resources.length === 0}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                {showLocationDropdown && resources.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {resources
                      .filter(r => r.description.toLowerCase().includes(cleanLocation(event.location).toLowerCase()))
                      .slice(0, 50)
                      .map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            updateField('location', r.description)
                            setShowLocationDropdown(false)
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-shefa-blue-50 text-sm text-slate-700"
                        >
                          {r.description}
                        </button>
                      ))}
                    {resources.filter(r => r.description.toLowerCase().includes(cleanLocation(event.location).toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        No matches found
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1 mb-1">
                  <DocumentTextIcon className="w-3 h-3" />
                  Type
                </label>
                <select
                  value={event.event_type}
                  onChange={(e) => updateField('event_type', e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
                >
                  {eventTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Veracross Availability Check */}
            {cleanLocation(event.location) && (
              <div className="pt-3 border-t border-slate-100 mt-3">
                <AvailabilityCheck
                  resourceId={selectedResourceId || undefined}
                  resourceName={cleanLocation(event.location)}
                  date={event.start_date}
                  startTime={toTimeInputFormat(event.start_time) || '09:00'}
                  endTime={toTimeInputFormat(event.end_time) || '17:00'}
                  excludeEventId={event.id}
                  excludeEventName={event.title}
                />
              </div>
            )}
          </div>
        </motion.div>

        {/* General Info & Notes Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-xl border border-slate-200 p-6"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Event Details</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="text-sm text-slate-600 font-medium flex items-center gap-1">
                <UsersIcon className="w-4 h-4" />
                Expected Attendees
              </label>
              <input
                type="number"
                value={event.expected_attendees || ''}
                onChange={(e) => updateField('expected_attendees', e.target.value ? parseInt(e.target.value) : null)}
                placeholder="Number of attendees"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none"
              />
            </div>
            
            <div>
              <label className="text-sm text-slate-600 font-medium flex items-center gap-1">
                <CakeIcon className="w-4 h-4" />
                Food
              </label>
              <div className="mt-1 space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={event.food_served}
                    onChange={(e) => updateField('food_served', e.target.checked)}
                    className="rounded border-slate-300 text-shefa-blue-600 focus:ring-shefa-blue-500"
                  />
                  <span className="text-sm text-slate-600">Food will be served</span>
                </label>
                {event.food_served && (
                  <input
                    type="text"
                    value={event.food_provider || ''}
                    onChange={(e) => updateField('food_provider', e.target.value)}
                    placeholder="Food provider"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none text-sm"
                  />
                )}
              </div>
            </div>
          </div>

          {/* General Notes - moved up */}
          <div>
            <label className="text-sm text-slate-600 font-medium">General Notes</label>
            <p className="text-xs text-slate-400 mb-2">Notes that apply to the entire event. Type @ to mention someone.</p>
            <MentionInput
              value={event.general_notes || ''}
              onChange={(value) => updateField('general_notes', value)}
              placeholder="Add general notes about this event... Type @ to mention someone"
              rows={4}
            />
          </div>

          {/* Conflict section - only shown when we detect actual conflicts */}
          {conflictingEvents.length > 0 && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-red-700">Scheduling Conflict Detected</h3>
                  <p className="text-sm text-red-600 mt-1">
                    Same location ({cleanLocation(event.location)}) with overlapping time:
                  </p>
                  
                  <div className="mt-3 space-y-2">
                    {conflictingEvents.map(ce => (
                      <div key={ce.id} className="bg-white rounded border border-red-200 p-3 text-sm">
                        <div className="font-medium text-slate-800">{ce.title}</div>
                        <div className="text-slate-500 text-xs mt-1">
                          {ce.start_time}
                          {ce.end_time && ` - ${ce.end_time}`}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <label className="flex items-center gap-2 mt-4">
                    <input
                      type="checkbox"
                      checked={event.conflict_ok}
                      onChange={(e) => updateField('conflict_ok', e.target.checked)}
                      className="rounded border-slate-300 text-shefa-blue-600 focus:ring-shefa-blue-500"
                    />
                    <span className="text-sm text-slate-600">Mark conflict as OK</span>
                  </label>
                  {event.conflict_ok && (
                    <textarea
                      value={event.conflict_notes || ''}
                      onChange={(e) => updateField('conflict_notes', e.target.value)}
                      placeholder="Why is this conflict acceptable?"
                      rows={2}
                      className="mt-2 w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none text-sm bg-white"
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Related Events Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <RelatedEvents eventId={event.id} />
        </motion.div>

        {/* Team Assignments - Tabbed Interface */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          {/* Team Toggle Buttons */}
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Team Assignments</h2>
            <p className="text-sm text-slate-500 mb-3">Select which teams need to be involved</p>
            
            <div className="flex flex-wrap gap-2">
              {teamSections.map(section => {
                const isAssigned = event[section.needsKey] as boolean
                const Icon = section.icon
                
                return (
                  <button
                    key={section.id}
                    onClick={() => toggleTeam(section.id)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                      isAssigned
                        ? `${section.bgColor} ${section.borderColor} ${section.color}`
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {section.shortTitle}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Team Tabs (only show if teams are assigned) */}
          {assignedTeams.length > 0 && (
            <>
              {/* Tab Headers */}
              <div className="flex border-b border-slate-200 overflow-x-auto">
                {assignedTeams.map(section => {
                  const Icon = section.icon
                  const isActive = activeTeamTab === section.id
                  
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveTeamTab(section.id)}
                      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                        isActive
                          ? `${section.color} ${section.borderColor}`
                          : 'text-slate-500 border-transparent hover:text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {section.title}
                    </button>
                  )
                })}
              </div>

              {/* Tab Content */}
              {activeSection && (
                <div className={`p-6 ${activeSection.bgColor}`}>
                  <div className="space-y-4">
                    {/* Extra fields specific to this team */}
                    {activeSection.extraFields && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeSection.extraFields.map(field => (
                          <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}>
                            {field.type === 'checkbox' ? (
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={(event[field.key] as boolean) || false}
                                  onChange={(e) => updateField(field.key, e.target.checked)}
                                  className="rounded border-slate-300 text-shefa-blue-600 focus:ring-shefa-blue-500"
                                />
                                <span className="text-sm text-slate-700">{field.label}</span>
                              </label>
                            ) : field.type === 'textarea' ? (
                              <>
                                <label className="text-sm text-slate-700 font-medium">{field.label}</label>
                                <textarea
                                  value={(event[field.key] as string) || ''}
                                  onChange={(e) => updateField(field.key, e.target.value)}
                                  placeholder={`Enter ${field.label.toLowerCase()}...`}
                                  rows={3}
                                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none text-sm bg-white"
                                />
                              </>
                            ) : (
                              <>
                                <label className="text-sm text-slate-700 font-medium">{field.label}</label>
                                <input
                                  type={field.type}
                                  value={(event[field.key] as string | number) || ''}
                                  onChange={(e) => updateField(field.key, field.type === 'number' ? (e.target.value ? parseInt(e.target.value) : null) : e.target.value)}
                                  placeholder={field.label}
                                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none text-sm bg-white"
                                />
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Team notes */}
                    <div>
                      <label className="text-sm text-slate-700 font-medium">
                        {activeSection.title} Notes
                      </label>
                      <MentionInput
                        value={(event[activeSection.notesKey] as string) || ''}
                        onChange={(value) => updateField(activeSection.notesKey, value)}
                        placeholder={`Add notes for ${activeSection.title.toLowerCase()}... Type @ to mention someone`}
                        rows={4}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Empty state when no teams assigned */}
          {assignedTeams.length === 0 && (
            <div className="p-8 text-center text-slate-500">
              <p>No teams assigned yet. Click the buttons above to assign teams.</p>
            </div>
          )}
        </motion.div>

        {/* Hidden Event Toggle */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-xl border border-slate-200 p-6"
        >
          <label className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-slate-800">Hide Event</h3>
              <p className="text-sm text-slate-500">Hidden events won't appear in the main calendar view</p>
            </div>
            <input
              type="checkbox"
              checked={event.is_hidden}
              onChange={(e) => updateField('is_hidden', e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-shefa-blue-600 focus:ring-shefa-blue-500"
            />
          </label>
        </motion.div>

        {/* Metadata */}
        <div className="text-xs text-slate-400 text-center pb-8">
          Created: {format(parseISO(event.created_at), 'MMM d, yyyy h:mm a')}
          {event.updated_at !== event.created_at && (
            <> • Updated: {format(parseISO(event.updated_at), 'MMM d, yyyy h:mm a')}</>
          )}
        </div>
          </div>

          {/* Sidebar - Right Column */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <ResourceScheduleSidebar
                resourceId={selectedResourceId}
                resourceName={cleanLocation(event.location)}
                date={event.start_date}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
