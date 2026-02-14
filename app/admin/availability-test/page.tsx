'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  ArrowLeftIcon,
  ClockIcon,
  CalendarDaysIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'

interface Resource {
  id: number
  description: string
  abbreviation?: string
  resource_type?: string
}

interface ConflictInfo {
  type: 'definite' | 'possible'
  reservation_id: number
  description: string
  start_date: string
  end_date?: string
  start_time?: string
  end_time?: string
  event_name?: string
  contact_person?: string
}

interface AvailabilityResult {
  available: boolean
  conflicts: ConflictInfo[]
  possible_conflicts: ConflictInfo[]
  raw_reservations?: any[]
  error?: string
}

export default function AvailabilityTestPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [resources, setResources] = useState<Resource[]>([])
  
  // Form state
  const [selectedResource, setSelectedResource] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [showDropdown, setShowDropdown] = useState(false)
  
  // Result state
  const [result, setResult] = useState<AvailabilityResult | null>(null)
  const [showDebug, setShowDebug] = useState(false)

  // Auth check
  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.user?.email) {
        router.push('/login')
        return
      }
      
      // Check portal access (any role is fine)
      const response = await fetch(`/api/auth/check-access?email=${encodeURIComponent(session.user.email.toLowerCase())}`)
      const data = await response.json()
      
      if (!data.hasAccess) {
        router.push('/')
        return
      }
      
      setCheckingAuth(false)
    }
    checkAuth()
  }, [router])

  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [resourcesError, setResourcesError] = useState<string | null>(null)

  // Load resources from ops_resources table (synced from BigQuery)
  useEffect(() => {
    async function loadResources() {
      setResourcesLoading(true)
      setResourcesError(null)
      
      try {
        const response = await fetch('/api/resources')
        const { data, error } = await response.json()
        
        console.log('Resources loaded:', data?.length, error)
        
        if (error) {
          setResourcesError(`Failed to load resources: ${error}`)
        } else if (data && data.length > 0) {
          setResources(data)
        } else {
          setResourcesError('No resources found. Please sync resources from Admin > Data Sync first.')
        }
      } catch (err: any) {
        setResourcesError(`Failed to load resources: ${err.message}`)
      }
      
      setResourcesLoading(false)
    }
    
    if (!checkingAuth) {
      loadResources()
    }
  }, [checkingAuth])

  // Set default date to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0]
    setSelectedDate(today)
  }, [])

  const checkAvailability = async () => {
    if (!selectedResource || !selectedDate) {
      alert('Please select a resource and date')
      return
    }

    setLoading(true)
    setResult(null)

    try {
      const response = await fetch('/api/veracross/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource_name: selectedResource,
          date: selectedDate,
          start_time: startTime,
          end_time: endTime,
        }),
      })

      const data = await response.json()
      setResult(data)
    } catch (error: any) {
      setResult({
        available: false,
        conflicts: [],
        possible_conflicts: [],
        error: error.message || 'Failed to check availability',
      })
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-shefa-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/admin')}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              Veracross Availability Test
            </h1>
            <p className="text-sm text-slate-500">
              Real-time resource availability check via Veracross API
            </p>
          </div>
        </div>

        {/* Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-slate-200 p-6 mb-6"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Check Availability
          </h2>

          {/* Resources Error/Warning */}
          {resourcesError && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
              {resourcesError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Resource Searchable Dropdown */}
            <div className="relative">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <MapPinIcon className="w-4 h-4 inline mr-1" />
                Resource / Location
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={selectedResource}
                  onChange={(e) => {
                    setSelectedResource(e.target.value)
                    setShowDropdown(true)
                  }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder={resourcesLoading ? "Loading resources..." : "Type to search..."}
                  disabled={resourcesLoading}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 pr-8 focus:border-shefa-blue-500 focus:outline-none disabled:bg-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  disabled={resourcesLoading || resources.length === 0}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {showDropdown && resources.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                  {resources
                    .filter(r => r.description.toLowerCase().includes(selectedResource.toLowerCase()))
                    .map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setSelectedResource(r.description)
                          setShowDropdown(false)
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-shefa-blue-50 text-sm text-slate-700"
                      >
                        {r.description}
                      </button>
                    ))}
                  {resources.filter(r => r.description.toLowerCase().includes(selectedResource.toLowerCase())).length === 0 && (
                    <div className="px-3 py-2 text-sm text-slate-500">
                      No matches found
                    </div>
                  )}
                </div>
              )}
              {resources.length > 0 && (
                <p className="text-xs text-slate-400 mt-1">{resources.length} resources from Veracross</p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <CalendarDaysIcon className="w-4 h-4 inline mr-1" />
                Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Start Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <ClockIcon className="w-4 h-4 inline mr-1" />
                Start Time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                <ClockIcon className="w-4 h-4 inline mr-1" />
                End Time
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:border-shefa-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            onClick={checkAvailability}
            disabled={loading || !selectedResource || !selectedDate}
            className="w-full md:w-auto px-6 py-2.5 bg-shefa-blue-500 text-white rounded-lg hover:bg-shefa-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Checking...
              </>
            ) : (
              <>
                <MagnifyingGlassIcon className="w-5 h-5" />
                Check Availability
              </>
            )}
          </button>
        </motion.div>

        {/* Results */}
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl border border-slate-200 p-6"
          >
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Results
            </h2>

            {result.error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
                <ExclamationTriangleIcon className="w-5 h-5 inline mr-2" />
                {result.error}
              </div>
            ) : (
              <>
                {/* Status Banner */}
                <div className={`rounded-lg p-4 mb-4 ${
                  result.available 
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {result.available ? (
                      <CheckCircleIcon className="w-8 h-8 text-green-500" />
                    ) : (
                      <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                    )}
                    <div>
                      <p className={`font-semibold text-lg ${
                        result.available ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {result.available ? 'Available' : 'Conflict Detected'}
                      </p>
                      <p className={`text-sm ${
                        result.available ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {result.available 
                          ? 'No conflicting reservations found for this time slot.'
                          : `Found ${result.conflicts.length} conflicting reservation(s).`
                        }
                      </p>
                    </div>
                  </div>
                </div>

                {/* Definite Conflicts */}
                {result.conflicts.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-red-700 uppercase mb-2 flex items-center gap-1">
                      <ExclamationTriangleIcon className="w-4 h-4" />
                      Conflicts ({result.conflicts.length})
                    </h3>
                    <div className="space-y-2">
                      {result.conflicts.map((c, i) => (
                        <div key={i} className="bg-red-50 border border-red-100 rounded-lg p-3">
                          <p className="font-medium text-slate-800">{c.description}</p>
                          {c.event_name && c.event_name !== c.description && (
                            <p className="text-sm text-slate-600">Event: {c.event_name}</p>
                          )}
                          <p className="text-sm text-slate-500">
                            {c.start_time && c.end_time 
                              ? `${c.start_time} - ${c.end_time}`
                              : 'Time not specified'
                            }
                            {c.start_date && ` on ${c.start_date}`}
                            {c.end_date && c.end_date !== c.start_date && ` to ${c.end_date}`}
                          </p>
                          {c.contact_person && (
                            <p className="text-xs text-slate-400">Contact: {c.contact_person}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Possible Conflicts */}
                {result.possible_conflicts.length > 0 && (
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-amber-700 uppercase mb-2 flex items-center gap-1">
                      <QuestionMarkCircleIcon className="w-4 h-4" />
                      Possible Conflicts - Verify Manually ({result.possible_conflicts.length})
                    </h3>
                    <p className="text-xs text-amber-600 mb-2">
                      These reservations are on the same resource/date but time data is incomplete.
                    </p>
                    <div className="space-y-2">
                      {result.possible_conflicts.map((c, i) => (
                        <div key={i} className="bg-amber-50 border border-amber-100 rounded-lg p-3">
                          <p className="font-medium text-slate-800">{c.description}</p>
                          {c.event_name && c.event_name !== c.description && (
                            <p className="text-sm text-slate-600">Event: {c.event_name}</p>
                          )}
                          <p className="text-sm text-slate-500">
                            {c.start_time || c.end_time 
                              ? `${c.start_time || '?'} - ${c.end_time || '?'}`
                              : 'Time not available'
                            }
                            {c.start_date && ` on ${c.start_date}`}
                          </p>
                          {c.contact_person && (
                            <p className="text-xs text-slate-400">Contact: {c.contact_person}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No Conflicts Message */}
                {result.available && result.possible_conflicts.length === 0 && (
                  <p className="text-sm text-slate-500">
                    The resource appears to be completely available for the requested time.
                  </p>
                )}

                {/* Debug Toggle */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <button
                    onClick={() => setShowDebug(!showDebug)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    {showDebug ? 'Hide' : 'Show'} raw API response
                  </button>
                  
                  {showDebug && result.raw_reservations && (
                    <pre className="mt-2 p-3 bg-slate-50 rounded-lg text-xs overflow-auto max-h-96">
                      {JSON.stringify(result.raw_reservations, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <h3 className="font-semibold text-blue-800 mb-2">How it works</h3>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Queries Veracross API directly for real-time reservation data</li>
            <li>• Matches reservations by resource name and date</li>
            <li>• <strong>Definite conflicts:</strong> Overlapping time ranges confirmed</li>
            <li>• <strong>Possible conflicts:</strong> Same resource/date but missing time data</li>
            <li>• Uses OAuth2 tokens cached in database (auto-refreshes)</li>
          </ul>
        </div>
      </main>
    </div>
  )
}
