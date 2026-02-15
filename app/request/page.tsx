'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { format, parseISO, addMinutes, isAfter, isPast } from 'date-fns'
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  PencilIcon,
  XMarkIcon,
  BuildingOffice2Icon,
  UserGroupIcon,
  WrenchScrewdriverIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  BuildingOfficeIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'

interface Resource {
  id: number
  resource_type: string
  description: string
  abbreviation?: string
  capacity?: number
}

interface StaffInfo {
  person_id: number
  first_name: string
  last_name: string
  full_name: string
  email: string
}

interface Conflict {
  type: 'conflict' | 'warning'
  title: string
  startTime: string
  endTime: string
  message: string
}

interface CalendarEvent {
  id: string
  title: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  type: 'reservation' | 'class' | 'calendar'
}

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
}

const QUICK_DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '1.5 hr', minutes: 90 },
  { label: '2 hr', minutes: 120 },
]

const TEAM_OPTIONS = [
  { id: 'program', label: 'Program Director', icon: UserGroupIcon },
  { id: 'office', label: 'Office', icon: BuildingOfficeIcon },
  { id: 'it', label: 'IT', icon: ComputerDesktopIcon },
  { id: 'security', label: 'Security', icon: ShieldCheckIcon },
  { id: 'facilities', label: 'Facilities', icon: WrenchScrewdriverIcon },
]

export default function RequestPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Staff info
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null)
  const [loadingStaff, setLoadingStaff] = useState(false)
  
  // Resources
  const [resources, setResources] = useState<Resource[]>([])
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [showResourceDropdown, setShowResourceDropdown] = useState(false)
  
  // Form state - Step 1: Reservation
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null)
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [quickDuration, setQuickDuration] = useState<number | null>(null)
  
  // Availability check
  const [checkingAvailability, setCheckingAvailability] = useState(false)
  const [availability, setAvailability] = useState<{ available: boolean; conflicts: Conflict[]; warnings: Conflict[] } | null>(null)
  
  // Resource calendar
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [loadingCalendar, setLoadingCalendar] = useState(false)
  
  // Form state - Step 2: Event Details
  const [step, setStep] = useState<'reserve' | 'details' | 'success'>('reserve')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  const [generalNotes, setGeneralNotes] = useState('')
  
  // Reservation result
  const [reservationId, setReservationId] = useState<string | null>(null)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  
  // Confirmation modal
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [reserving, setReserving] = useState(false)
  
  // User's events
  const [userEvents, setUserEvents] = useState<UserEvent[]>([])
  const [loadingUserEvents, setLoadingUserEvents] = useState(false)
  
  // Submitting event details
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    checkUser()
  }, [])

  // Close resource dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement
      if (!target.closest('.resource-search-container')) {
        setShowResourceDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (user?.email) {
      fetchStaffInfo(user.email)
      fetchResources()
      fetchUserEvents()
    }
  }, [user])

  useEffect(() => {
    if (selectedResource && date) {
      fetchResourceCalendar()
    }
  }, [selectedResource, date])

  useEffect(() => {
    // Auto-check availability when all required fields are filled
    console.log('Availability check state:', { 
      selectedResource: selectedResource?.description || null, 
      date, 
      startTime, 
      endTime 
    })
    if (selectedResource && date && startTime && endTime) {
      const debounceTimer = setTimeout(() => {
        checkAvailability()
      }, 500)
      return () => clearTimeout(debounceTimer)
    } else {
      setAvailability(null)
    }
  }, [selectedResource, date, startTime, endTime])

  useEffect(() => {
    // Update end time when quick duration is selected
    if (quickDuration && startTime) {
      const [hours, minutes] = startTime.split(':').map(Number)
      const startDate = new Date()
      startDate.setHours(hours, minutes, 0, 0)
      const endDate = addMinutes(startDate, quickDuration)
      setEndTime(format(endDate, 'HH:mm'))
    }
  }, [quickDuration, startTime])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    // Allow any @shefaschool.org user to use the request form
    setUser(session?.user || null)
    setLoading(false)
  }

  async function handleSignIn() {
    setSigningIn(true)
    setError(null)
    
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=/request`,
        queryParams: {
          hd: 'shefaschool.org'
        }
      }
    })
    
    if (error) {
      setError('Failed to initiate sign in. Please try again.')
      setSigningIn(false)
    }
  }

  async function fetchStaffInfo(email: string) {
    setLoadingStaff(true)
    try {
      const res = await fetch(`/api/staff/lookup?email=${encodeURIComponent(email)}`)
      if (res.ok) {
        const data = await res.json()
        setStaffInfo(data)
      } else {
        console.warn('Staff not found for email:', email)
      }
    } catch (err) {
      console.error('Error fetching staff info:', err)
    }
    setLoadingStaff(false)
  }

  async function fetchResources() {
    try {
      const res = await fetch('/api/resources')
      if (res.ok) {
        const { data } = await res.json()
        setResources(data || [])
        const types = [...new Set((data || []).map((r: Resource) => r.resource_type).filter(Boolean))]
        setResourceTypes(types as string[])
      }
    } catch (err) {
      console.error('Error fetching resources:', err)
    }
  }

  async function fetchResourceCalendar() {
    if (!selectedResource || !date) return
    
    setLoadingCalendar(true)
    try {
      const res = await fetch(`/api/resources/${selectedResource.id}/calendar?date=${date}`)
      if (res.ok) {
        const data = await res.json()
        setCalendarEvents(data.events || [])
      }
    } catch (err) {
      console.error('Error fetching calendar:', err)
    }
    setLoadingCalendar(false)
  }

  async function checkAvailability() {
    if (!selectedResource || !date || !startTime || !endTime) return
    
    setCheckingAvailability(true)
    try {
      const res = await fetch(
        `/api/availability/check?resourceId=${selectedResource.id}&date=${date}&startTime=${startTime}&endTime=${endTime}`
      )
      if (res.ok) {
        const data = await res.json()
        setAvailability(data)
        // Debug info
        if (data.debug) {
          console.log('🔍 Availability Debug:', data.debug)
        }
      }
    } catch (err) {
      console.error('Error checking availability:', err)
    }
    setCheckingAvailability(false)
  }

  async function fetchUserEvents() {
    if (!user?.email) return
    
    setLoadingUserEvents(true)
    try {
      const res = await fetch(`/api/user-events?email=${encodeURIComponent(user.email)}`)
      if (res.ok) {
        const data = await res.json()
        setUserEvents(data.events || [])
      }
    } catch (err) {
      console.error('Error fetching user events:', err)
    }
    setLoadingUserEvents(false)
  }

  async function handleReserve() {
    if (!selectedResource || !staffInfo || !date || !startTime || !endTime) return
    
    setReserving(true)
    setError(null)
    
    try {
      // Call Veracross API to create reservation
      const res = await fetch('/api/veracross/create-reservation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: title || `Resource Reservation - ${selectedResource.description}`,
          resource_id: selectedResource.id,
          resource_name: selectedResource.description,
          start_date: date,
          end_date: date,
          start_time: startTime,
          end_time: endTime,
          requestor_id: staffInfo.person_id,
          requestor_email: user.email,
        })
      })
      
      const data = await res.json()
      
      if (!data.success) {
        if (res.status === 409) {
          setError('Sorry, this slot was just booked. Please try another time.')
          // Refresh availability
          checkAvailability()
          fetchResourceCalendar()
        } else {
          setError(data.error || 'Failed to create reservation')
        }
        setReserving(false)
        setShowConfirmModal(false)
        return
      }
      
      setReservationId(data.reservation_id)
      setShowConfirmModal(false)
      setStep('details')
      
      // Refresh calendar
      fetchResourceCalendar()
      
    } catch (err: any) {
      setError(err.message || 'Failed to create reservation')
    }
    
    setReserving(false)
  }

  async function handleSubmitDetails() {
    if (!selectedResource || !staffInfo || !reservationId) return
    
    setSubmitting(true)
    setError(null)
    
    try {
      // Create event in ops_events
      const res = await fetch('/api/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || `${staffInfo.full_name}'s Event`,
          description,
          start_date: date,
          end_date: date,
          start_time: startTime,
          end_time: endTime,
          all_day: false,
          resource_id: selectedResource.id,
          location: selectedResource.description,
          event_type: 'other',
          general_notes: generalNotes,
          needs_program_director: selectedTeams.includes('program'),
          needs_office: selectedTeams.includes('office'),
          needs_it: selectedTeams.includes('it'),
          needs_security: selectedTeams.includes('security'),
          needs_facilities: selectedTeams.includes('facilities'),
          // Self-service specific fields
          requested_by: user.email,
          requested_at: new Date().toISOString(),
          veracross_reservation_id: reservationId,
          status: 'active',
        })
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        setError(data.error || 'Failed to save event details')
        setSubmitting(false)
        return
      }
      
      setCreatedEventId(data.data?.id)
      setStep('success')
      
      // Refresh user events
      fetchUserEvents()
      
    } catch (err: any) {
      setError(err.message || 'Failed to save event details')
    }
    
    setSubmitting(false)
  }

  function resetForm() {
    setStep('reserve')
    setSelectedResource(null)
    setDate('')
    setStartTime('')
    setEndTime('')
    setQuickDuration(null)
    setTitle('')
    setDescription('')
    setSelectedTeams([])
    setGeneralNotes('')
    setReservationId(null)
    setCreatedEventId(null)
    setAvailability(null)
    setCalendarEvents([])
    setError(null)
  }

  const filteredResources = resources
    .filter(r => !selectedType || r.resource_type === selectedType)
    .filter(r => !resourceSearch || r.description.toLowerCase().includes(resourceSearch.toLowerCase()))

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-blue-600 px-8 py-6 text-center">
              <div className="flex justify-center mb-4">
                <CalendarIcon className="w-12 h-12 text-white" strokeWidth={1.5} />
              </div>
              <h1 className="text-2xl font-bold text-white">Request a Resource</h1>
              <p className="text-blue-200 text-sm mt-1">Reserve rooms and resources for your events</p>
            </div>
            
            <div className="p-8">
              {error && (
                <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
              
              <button
                onClick={handleSignIn}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 
                         border border-slate-300 rounded-lg hover:bg-slate-50 
                         transition-colors font-medium text-slate-700
                         disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                {signingIn ? (
                  <>
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
              
              <p className="text-xs text-slate-500 text-center mt-6">
                Access restricted to @shefaschool.org accounts
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Success screen
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center"
        >
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircleIcon className="w-10 h-10 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Reservation Confirmed!</h2>
          <p className="text-slate-600 mb-6">
            Your resource has been reserved and the event has been created.
            The operations team has been notified.
          </p>
          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <p className="font-medium text-slate-800">{title || 'Resource Reservation'}</p>
            <p className="text-sm text-slate-600">
              {selectedResource?.description} • {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
            </p>
            <p className="text-sm text-slate-600">
              {startTime} - {endTime}
            </p>
          </div>
          <button
            onClick={resetForm}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Make Another Reservation
          </button>
        </motion.div>
      </div>
    )
  }

  // Main form
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-slate-800">Request a Resource</h1>
              <p className="text-sm text-slate-500">
                Welcome, {staffInfo?.full_name || user.email}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              setUser(null)
            }}
            className="text-sm text-slate-600 hover:text-slate-800"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start gap-3"
          >
            <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="ml-auto">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step indicator */}
            <div className="flex items-center gap-4 mb-6">
              <div className={`flex items-center gap-2 ${step === 'reserve' ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === 'reserve' ? 'bg-blue-600 text-white' : step === 'details' ? 'bg-green-500 text-white' : 'bg-slate-200'
                }`}>
                  {step === 'details' ? <CheckCircleIcon className="w-5 h-5" /> : '1'}
                </div>
                <span className="font-medium">Reserve Resource</span>
              </div>
              <div className="flex-1 h-0.5 bg-slate-200" />
              <div className={`flex items-center gap-2 ${step === 'details' ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === 'details' ? 'bg-blue-600 text-white' : 'bg-slate-200'
                }`}>
                  2
                </div>
                <span className="font-medium">Event Details</span>
              </div>
            </div>

            {step === 'reserve' ? (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <h2 className="text-lg font-semibold text-slate-800">Select Resource & Time</h2>

                {/* Resource Type Filter */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Resource Type
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => {
                      setSelectedType(e.target.value)
                      setSelectedResource(null)
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">All Types</option>
                    {resourceTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                {/* Resource Selection - Searchable */}
                <div className="relative resource-search-container">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Resource <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={selectedResource ? selectedResource.description : resourceSearch}
                    onChange={(e) => {
                      setResourceSearch(e.target.value)
                      setSelectedResource(null)
                      setShowResourceDropdown(true)
                    }}
                    onFocus={() => setShowResourceDropdown(true)}
                    placeholder="Type to search resources..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {showResourceDropdown && filteredResources.length > 0 && !selectedResource && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {filteredResources.map(res => (
                        <button
                          key={res.id}
                          onClick={() => {
                            setSelectedResource(res)
                            setResourceSearch('')
                            setShowResourceDropdown(false)
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-slate-50 flex justify-between items-center"
                        >
                          <span>{res.description}</span>
                          {res.capacity && <span className="text-xs text-slate-500">Cap: {res.capacity}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date & Time - All on one row */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Start Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value)
                        setQuickDuration(null)
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      End Time <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value)
                        setQuickDuration(null)
                      }}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Quick Duration Buttons */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Quick Duration
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_DURATIONS.map(({ label, minutes }) => (
                      <button
                        key={minutes}
                        onClick={() => {
                          setQuickDuration(minutes)
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          quickDuration === minutes
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Event Title (optional at this stage) */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Event Title (optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Team Meeting, Parent Event..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Availability Status */}
                {availability && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    {availability.available ? (
                      <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                        <CheckCircleIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-green-800">Available!</p>
                          <p className="text-sm text-green-700">
                            This time slot is available for reservation.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <ExclamationCircleIcon className="w-6 h-6 text-red-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-800">Not Available</p>
                          <ul className="text-sm text-red-700 mt-1 space-y-1">
                            {availability.conflicts.map((c, i) => (
                              <li key={i}>{c.message}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {availability.warnings.length > 0 && (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                        <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-yellow-800">Notes</p>
                          <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                            {availability.warnings.map((w, i) => (
                              <li key={i}>{w.message}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {checkingAvailability && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                    <span className="text-slate-600">Checking availability...</span>
                  </div>
                )}

                {/* Reserve Button */}
                <button
                  onClick={() => setShowConfirmModal(true)}
                  disabled={!selectedResource || !date || !startTime || !endTime || !availability?.available || !staffInfo}
                  className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 
                           disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                  Reserve Resource
                </button>

                {!staffInfo && user && (
                  <p className="text-sm text-amber-600 text-center">
                    Your email is not linked to a staff record. Please contact the office.
                  </p>
                )}
              </div>
            ) : (
              /* Step 2: Event Details */
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">Event Details</h2>
                    <p className="text-sm text-slate-500 mt-1">
                      Your resource has been reserved. Add additional details for the operations team.
                    </p>
                  </div>
                  <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                    Reserved
                  </div>
                </div>

                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="font-medium text-slate-800">{selectedResource?.description}</p>
                  <p className="text-sm text-slate-600">
                    {date && format(parseISO(date), 'EEEE, MMMM d, yyyy')} • {startTime} - {endTime}
                  </p>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Event Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Team Meeting, Parent Event..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Describe your event..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Teams */}
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
                            if (isSelected) {
                              setSelectedTeams(selectedTeams.filter(t => t !== team.id))
                            } else {
                              setSelectedTeams([...selectedTeams, team.id])
                            }
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-blue-500 text-blue-700'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {team.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* General Notes */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Notes for Operations Team
                  </label>
                  <textarea
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    rows={3}
                    placeholder="Any special requirements, setup needs, etc..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Submit Button */}
                <div className="flex gap-3">
                  <button
                    onClick={handleSubmitDetails}
                    disabled={submitting}
                    className="flex-1 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 
                             disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <PaperAirplaneIcon className="w-5 h-5" />
                        Submit Event
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* User's Existing Events */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Your Upcoming Events</h3>
              
              {loadingUserEvents ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : userEvents.length === 0 ? (
                <p className="text-slate-500 text-center py-8">
                  You don't have any upcoming events.
                </p>
              ) : (
                <div className="space-y-3">
                  {userEvents.map(event => (
                    <div
                      key={event.id}
                      className={`p-4 rounded-lg border ${
                        event.status === 'cancelled'
                          ? 'bg-slate-50 border-slate-200 opacity-60'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className={`font-medium ${event.status === 'cancelled' ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                            {event.title}
                          </p>
                          <p className="text-sm text-slate-600">
                            {format(parseISO(event.start_date), 'EEE, MMM d')} • {event.start_time} - {event.end_time}
                          </p>
                          {event.location && (
                            <p className="text-sm text-slate-500">{event.location}</p>
                          )}
                        </div>
                        {event.status === 'cancelled' ? (
                          <span className="px-2 py-1 bg-slate-200 text-slate-600 text-xs rounded-full">
                            Cancelled
                          </span>
                        ) : !isPast(parseISO(event.start_date)) && (
                          <button
                            onClick={() => router.push(`/request/event/${event.id}`)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Resource Calendar Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sticky top-8">
              <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <ClockIcon className="w-5 h-5" />
                Schedule for {date ? format(parseISO(date), 'MMM d') : 'Selected Date'}
              </h3>

              {!selectedResource || !date ? (
                <p className="text-slate-500 text-sm">
                  Select a resource and date to see the schedule.
                </p>
              ) : loadingCalendar ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                </div>
              ) : calendarEvents.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">
                  No events scheduled for this resource on this date.
                </p>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {/* All-day events first */}
                  {calendarEvents.filter(e => e.allDay).map(event => (
                    <div
                      key={event.id}
                      className={`p-3 rounded-lg text-sm ${
                        event.type === 'calendar'
                          ? 'bg-purple-50 border border-purple-200'
                          : 'bg-blue-50 border border-blue-200'
                      }`}
                    >
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-slate-500">All day</p>
                    </div>
                  ))}
                  
                  {/* Timed events */}
                  {calendarEvents.filter(e => !e.allDay).map(event => (
                    <div
                      key={event.id}
                      className={`p-3 rounded-lg text-sm ${
                        event.type === 'class'
                          ? 'bg-amber-50 border border-amber-200'
                          : 'bg-slate-50 border border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <p className="font-medium">{event.title}</p>
                        {event.type === 'class' && (
                          <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                            Class
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        {event.startTime} - {event.endTime}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Legend */}
              {calendarEvents.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-500 mb-2">Legend:</p>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-amber-400 rounded" />
                      Class
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-blue-400 rounded" />
                      Reservation
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-purple-400 rounded" />
                      Calendar Event
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !reserving && setShowConfirmModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full p-6"
              onClick={e => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-800 mb-4">Confirm Reservation</h3>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="font-medium text-slate-800">{selectedResource?.description}</p>
                <p className="text-sm text-slate-600">
                  {date && format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                </p>
                <p className="text-sm text-slate-600">
                  {startTime} - {endTime}
                </p>
                <p className="text-sm text-slate-500 mt-2">
                  Requested by: {staffInfo?.full_name || user.email}
                </p>
              </div>
              
              <p className="text-sm text-slate-600 mb-6">
                This will create a reservation in Veracross. You'll be able to add event details in the next step.
              </p>
              
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  disabled={reserving}
                  className="flex-1 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 
                           disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReserve}
                  disabled={reserving}
                  className="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 
                           disabled:bg-blue-400 transition-colors flex items-center justify-center gap-2"
                >
                  {reserving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Reserving...
                    </>
                  ) : (
                    'Confirm Reservation'
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
