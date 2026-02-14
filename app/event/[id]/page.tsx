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

  useEffect(() => {
    fetchEvent()
  }, [params.id])

  // Check subscription status when user and event are loaded
  useEffect(() => {
    if (user?.email && params.id) {
      checkSubscription()
    }
  }, [user?.email, params.id])

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
      
      // Set active tab to first assigned team
      const firstAssigned = teamSections.find(s => result.data[s.needsKey])
      if (firstAssigned) {
        setActiveTeamTab(firstAssigned.id)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
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
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    } catch (error) {
      setSaveStatus('error')
      console.error('Error:', error)
    } finally {
      setSaving(false)
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
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
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
                {event.has_conflict && !event.conflict_ok && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
                    <ExclamationTriangleIcon className="w-3 h-3" />
                    Conflict
                  </span>
                )}
              </div>
              
              <input
                type="text"
                value={event.title}
                onChange={(e) => updateField('title', e.target.value)}
                className="text-2xl font-bold text-slate-800 w-full border-0 border-b-2 border-transparent hover:border-slate-200 focus:border-shefa-blue-500 focus:outline-none transition-colors bg-transparent"
              />
              
              <textarea
                value={event.description || ''}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Add a description..."
                rows={2}
                className="mt-2 text-slate-600 w-full border-0 border-b-2 border-transparent hover:border-slate-200 focus:border-shefa-blue-500 focus:outline-none transition-colors bg-transparent resize-none"
              />
              
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

          {/* Quick Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div>
              <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                Date
              </label>
              <input
                type="date"
                value={event.start_date}
                onChange={(e) => updateField('start_date', e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1">
                <ClockIcon className="w-3 h-3" />
                Time
              </label>
              <div className="flex gap-1 mt-1">
                <input
                  type="time"
                  value={event.start_time || ''}
                  onChange={(e) => updateField('start_time', e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
                />
                <span className="self-center text-slate-400">-</span>
                <input
                  type="time"
                  value={event.end_time || ''}
                  onChange={(e) => updateField('end_time', e.target.value)}
                  className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1">
                <MapPinIcon className="w-3 h-3" />
                Location
              </label>
              <input
                type="text"
                value={cleanLocation(event.location)}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="Location"
                className="mt-1 w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 uppercase font-medium flex items-center gap-1">
                <DocumentTextIcon className="w-3 h-3" />
                Type
              </label>
              <select
                value={event.event_type}
                onChange={(e) => updateField('event_type', e.target.value)}
                className="mt-1 w-full text-sm border border-slate-200 rounded px-2 py-1.5 focus:border-shefa-blue-500 focus:outline-none"
              >
                {eventTypes.map(type => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </div>
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
            <p className="text-xs text-slate-400 mb-2">Notes that apply to the entire event</p>
            <textarea
              value={event.general_notes || ''}
              onChange={(e) => updateField('general_notes', e.target.value)}
              placeholder="Add general notes about this event..."
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* Conflict section */}
          {event.has_conflict && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-medium text-red-700">Conflict Detected</h3>
                  <label className="flex items-center gap-2 mt-2">
                    <input
                      type="checkbox"
                      checked={event.conflict_ok}
                      onChange={(e) => updateField('conflict_ok', e.target.checked)}
                      className="rounded border-slate-300 text-shefa-blue-600 focus:ring-shefa-blue-500"
                    />
                    <span className="text-sm text-slate-600">Mark conflict as OK</span>
                  </label>
                  <textarea
                    value={event.conflict_notes || ''}
                    onChange={(e) => updateField('conflict_notes', e.target.value)}
                    placeholder="Add notes about this conflict..."
                    rows={2}
                    className="mt-2 w-full border border-red-200 rounded-lg px-3 py-2 focus:border-red-500 focus:outline-none text-sm"
                  />
                </div>
              </div>
            </div>
          )}
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
                      <textarea
                        value={(event[activeSection.notesKey] as string) || ''}
                        onChange={(e) => updateField(activeSection.notesKey, e.target.value)}
                        placeholder={`Add notes for ${activeSection.title.toLowerCase()}...`}
                        rows={4}
                        className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none text-sm bg-white"
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
    </div>
  )
}
