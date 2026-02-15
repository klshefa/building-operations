'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion } from 'framer-motion'
import { format, parseISO, addDays } from 'date-fns'
import Navbar from '@/components/Navbar'
import EventCard from '@/components/EventCard'
import type { OpsEvent, EventSource } from '@/lib/types'
import {
  FunnelIcon,
  MagnifyingGlassIcon,
  EyeSlashIcon,
  EyeIcon,
} from '@heroicons/react/24/outline'

const sourceFilters: { value: EventSource | 'all'; label: string }[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'bigquery_group', label: 'Group Events' },
  { value: 'bigquery_resource', label: 'Resource Reservations' },
  { value: 'calendar_staff', label: 'Staff Calendar' },
  { value: 'calendar_ls', label: 'Lower School' },
  { value: 'calendar_ms', label: 'Middle School' },
  { value: 'manual', label: 'Manual' },
]

export default function EventsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<EventSource | 'all'>('all')
  const [showHidden, setShowHidden] = useState(false)
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'all'>('month')

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchEvents()
    }
  }, [user, sourceFilter, showHidden, dateRange])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      router.push('/')
      return
    }
    setUser(session.user)
    setAuthLoading(false)
  }

  async function fetchEvents() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    
    // Build query params
    const params = new URLSearchParams()
    params.set('startDate', today)
    
    if (dateRange === 'week') {
      params.set('endDate', format(addDays(new Date(), 7), 'yyyy-MM-dd'))
    } else if (dateRange === 'month') {
      params.set('endDate', format(addDays(new Date(), 30), 'yyyy-MM-dd'))
    }
    
    if (sourceFilter !== 'all') {
      params.set('source', sourceFilter)
    }
    
    if (!showHidden) {
      params.set('hideHidden', 'true')
    }

    try {
      const res = await fetch(`/api/events?${params.toString()}`)
      if (res.ok) {
        const { data } = await res.json()
        setEvents(data || [])
      } else {
        console.error('Error fetching events:', await res.text())
        setEvents([])
      }
    } catch (err) {
      console.error('Error fetching events:', err)
      setEvents([])
    }
    setLoading(false)
  }

  const filteredEvents = events.filter(e => {
    if (!search) return true
    const searchLower = search.toLowerCase()
    return (
      e.title.toLowerCase().includes(searchLower) ||
      e.description?.toLowerCase().includes(searchLower) ||
      e.location?.toLowerCase().includes(searchLower)
    )
  })

  // Group events by date
  const groupedEvents = filteredEvents.reduce((acc, event) => {
    const date = event.start_date
    if (!acc[date]) acc[date] = []
    acc[date].push(event)
    return acc
  }, {} as Record<string, OpsEvent[]>)

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Navbar />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold text-slate-800">All Events</h1>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[150px] sm:flex-none">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search events..."
                  className="pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent w-full sm:w-48 md:w-64"
                />
              </div>

              {/* Source Filter */}
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as EventSource | 'all')}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent flex-1 sm:flex-none"
              >
                {sourceFilters.map(f => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>

              {/* Date Range */}
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'all')}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent flex-1 sm:flex-none"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="all">All Future</option>
              </select>

              {/* Show Hidden */}
              <button
                onClick={() => setShowHidden(!showHidden)}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  showHidden
                    ? 'bg-shefa-blue-100 text-shefa-blue-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                title={showHidden ? 'Hide hidden events' : 'Show hidden events'}
              >
                {showHidden ? <EyeIcon className="w-5 h-5" /> : <EyeSlashIcon className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Events List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
            </div>
          ) : filteredEvents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-xl p-12 text-center border border-slate-200"
            >
              <p className="text-slate-500">No events found</p>
            </motion.div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedEvents).map(([date, dayEvents]) => (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
                    {format(parseISO(date), 'EEEE, MMMM d, yyyy')}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dayEvents.map(event => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>
  )
}
