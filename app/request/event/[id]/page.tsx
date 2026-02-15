'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, isPast } from 'date-fns'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  BuildingOfficeIcon,
  TrashIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'

interface UserEvent {
  id: string
  title: string
  description?: string
  start_date: string
  start_time?: string
  end_time?: string
  location?: string
  status: 'active' | 'cancelled'
  requested_at?: string
  general_notes?: string
  needs_program_director?: boolean
  needs_office?: boolean
  needs_it?: boolean
  needs_security?: boolean
  needs_facilities?: boolean
}

const TEAM_OPTIONS = [
  { id: 'program', label: 'Program Director', icon: UserGroupIcon, needsKey: 'needs_program_director' },
  { id: 'office', label: 'Office', icon: BuildingOfficeIcon, needsKey: 'needs_office' },
  { id: 'it', label: 'IT', icon: ComputerDesktopIcon, needsKey: 'needs_it' },
  { id: 'security', label: 'Security', icon: ShieldCheckIcon, needsKey: 'needs_security' },
  { id: 'facilities', label: 'Facilities', icon: WrenchScrewdriverIcon, needsKey: 'needs_facilities' },
]

export default function UserEventEditPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string
  
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<UserEvent | null>(null)
  const [loadingEvent, setLoadingEvent] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [generalNotes, setGeneralNotes] = useState('')
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  
  // Action states
  const [saving, setSaving] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user?.email && eventId) {
      fetchEvent()
    }
  }, [user, eventId])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session?.user) {
      router.push('/request')
      return
    }
    
    setUser(session.user)
    setLoading(false)
  }

  async function fetchEvent() {
    setLoadingEvent(true)
    try {
      // Fetch the event using the events API with auth check
      const supabase = createClient()
      const { data, error } = await supabase
        .from('ops_events')
        .select('*')
        .eq('id', eventId)
        .single()
      
      if (error || !data) {
        setError('Event not found')
        setLoadingEvent(false)
        return
      }
      
      // Verify ownership
      if (data.requested_by !== user.email) {
        setError('You do not have permission to view this event')
        setLoadingEvent(false)
        return
      }
      
      setEvent(data as UserEvent)
      setTitle(data.title || '')
      setDescription(data.description || '')
      setGeneralNotes(data.general_notes || '')
      
      // Set selected teams
      const teams: string[] = []
      if (data.needs_program_director) teams.push('program')
      if (data.needs_office) teams.push('office')
      if (data.needs_it) teams.push('it')
      if (data.needs_security) teams.push('security')
      if (data.needs_facilities) teams.push('facilities')
      setSelectedTeams(teams)
      
    } catch (err: any) {
      setError(err.message || 'Failed to load event')
    }
    setLoadingEvent(false)
  }

  async function handleSave() {
    if (!event || !user?.email) return
    
    setSaving(true)
    setError(null)
    setSuccess(null)
    
    try {
      const res = await fetch('/api/user-events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          email: user.email,
          title,
          description,
          general_notes: generalNotes,
          selectedTeams,
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to save changes')
      } else {
        setSuccess('Changes saved successfully')
        // Update local state
        setEvent({ ...event, title, description, general_notes: generalNotes } as UserEvent)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save changes')
    }
    
    setSaving(false)
  }

  async function handleCancel() {
    if (!event || !user?.email) return
    
    setCancelling(true)
    setError(null)
    
    try {
      const res = await fetch('/api/user-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: event.id,
          email: user.email,
          action: 'cancel',
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to cancel event')
        setCancelling(false)
        setShowCancelModal(false)
      } else {
        // Redirect to request page with success message
        router.push('/request?cancelled=true')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to cancel event')
      setCancelling(false)
      setShowCancelModal(false)
    }
  }

  if (loading || loadingEvent) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !event) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
          <ExclamationCircleIcon className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Error</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <Link
            href="/request"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Request Form
          </Link>
        </div>
      </div>
    )
  }

  if (!event) return null

  const isEventPast = isPast(parseISO(event.start_date))
  const isCancelled = event.status === 'cancelled'
  const canEdit = !isEventPast && !isCancelled

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <Link
            href="/request"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 mb-4"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Request Form
          </Link>
          <h1 className="text-2xl font-bold text-slate-800">
            {canEdit ? 'Edit Event' : 'View Event'}
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Status Banner */}
        {isCancelled && (
          <div className="mb-6 p-4 bg-slate-100 border border-slate-300 rounded-lg">
            <p className="font-medium text-slate-700">This event has been cancelled</p>
            <p className="text-sm text-slate-500">
              The operations team has been notified to remove the Veracross reservation.
            </p>
          </div>
        )}

        {isEventPast && !isCancelled && (
          <div className="mb-6 p-4 bg-slate-100 border border-slate-300 rounded-lg">
            <p className="font-medium text-slate-700">This event has passed</p>
            <p className="text-sm text-slate-500">
              Past events cannot be edited.
            </p>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3"
          >
            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
            <button onClick={() => setError(null)} className="ml-auto">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-start gap-3"
          >
            <CheckCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{success}</p>
            <button onClick={() => setSuccess(null)} className="ml-auto">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
          {/* Event Info (Read Only) */}
          <div className="p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="flex items-center gap-2 text-slate-600">
              <CalendarIcon className="w-5 h-5" />
              <span>{format(parseISO(event.start_date), 'EEEE, MMMM d, yyyy')}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <ClockIcon className="w-5 h-5" />
              <span>{event.start_time} - {event.end_time}</span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2 text-slate-600">
                <MapPinIcon className="w-5 h-5" />
                <span>{event.location}</span>
              </div>
            )}
            <p className="text-xs text-slate-500 mt-2">
              To change date, time, or location, please contact the operations team.
            </p>
          </div>

          {/* Editable Fields */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Event Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={!canEdit}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Teams Needed
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {TEAM_OPTIONS.map(team => {
                const Icon = team.icon
                const isSelected = selectedTeams.includes(team.id)
                return (
                  <button
                    key={team.id}
                    onClick={() => {
                      if (!canEdit) return
                      if (isSelected) {
                        setSelectedTeams(selectedTeams.filter(t => t !== team.id))
                      } else {
                        setSelectedTeams([...selectedTeams, team.id])
                      }
                    }}
                    disabled={!canEdit}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Icon className="w-4 h-4" />
                    {team.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notes for Operations Team
            </label>
            <textarea
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              rows={3}
              disabled={!canEdit}
              placeholder="Any special requirements, setup needs, etc..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
            />
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex gap-3 pt-4 border-t border-slate-200">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition-colors flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
              <button
                onClick={() => setShowCancelModal(true)}
                className="px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4" />
                Cancel Event
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      <AnimatePresence>
        {showCancelModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !cancelling && setShowCancelModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-lg font-semibold text-slate-800">Cancel Event</h3>
              </div>
              
              <p className="text-slate-600 mb-6">
                Are you sure you want to cancel this event? The operations team will be notified to remove the Veracross reservation.
              </p>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="font-medium text-slate-800">{event.title}</p>
                <p className="text-sm text-slate-600">
                  {format(parseISO(event.start_date), 'EEEE, MMMM d, yyyy')} • {event.start_time} - {event.end_time}
                </p>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  disabled={cancelling}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Keep Event
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex-1 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 transition-colors flex items-center justify-center gap-2"
                >
                  {cancelling ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Yes, Cancel Event'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
