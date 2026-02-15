'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LoginScreen } from '@/components/LoginScreen'
import { motion } from 'framer-motion'
import { format, isToday, isTomorrow, isThisWeek, addDays, parseISO } from 'date-fns'
import Navbar from '@/components/Navbar'
import EventCard from '@/components/EventCard'
import type { OpsEvent } from '@/lib/types'
import {
  CalendarDaysIcon,
  ClockIcon,
  ArrowRightIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loadingEvents, setLoadingEvents] = useState(false)
  const [recentRequests, setRecentRequests] = useState<OpsEvent[]>([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  useEffect(() => {
    checkUser()
    
    // Check URL for auth errors
    const params = new URLSearchParams(window.location.search)
    const urlError = params.get('error')
    if (urlError === 'unauthorized_domain') {
      setError('Access restricted to @shefaschool.org accounts')
    } else if (urlError === 'no_access') {
      setError('You do not have access to this portal. Contact an administrator.')
    } else if (urlError) {
      setError('Authentication failed. Please try again.')
    }
    
    // Clear URL params
    if (urlError) {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  useEffect(() => {
    if (user) {
      fetchEvents()
      fetchRecentRequests()
    }
  }, [user])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
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
        redirectTo: `${window.location.origin}/auth/callback`,
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

  async function fetchEvents() {
    setLoadingEvents(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd')

    try {
      const res = await fetch(`/api/events?startDate=${today}&endDate=${weekEnd}&hideHidden=true`)
      if (res.ok) {
        const { data } = await res.json()
        setEvents(data || [])
      } else {
        console.error('Error fetching events:', await res.text())
      }
    } catch (err) {
      console.error('Error fetching events:', err)
    }
    setLoadingEvents(false)
  }

  async function fetchRecentRequests() {
    setLoadingRequests(true)
    try {
      const res = await fetch('/api/events/recent-requests')
      if (res.ok) {
        const { data } = await res.json()
        setRecentRequests(data || [])
      }
    } catch (err) {
      console.error('Error fetching recent requests:', err)
    }
    setLoadingRequests(false)
  }

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  // Show login screen if not authenticated
  if (!user) {
    return <LoginScreen onSignIn={handleSignIn} loading={signingIn} error={error || undefined} />
  }

  // User is authenticated - show dashboard
  const todayEvents = events.filter(e => isToday(parseISO(e.start_date)))
  const tomorrowEvents = events.filter(e => isTomorrow(parseISO(e.start_date)))
  const thisWeekEvents = events.filter(e => {
    const date = parseISO(e.start_date)
    return isThisWeek(date) && !isToday(date) && !isTomorrow(date)
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-800">Building Operations Dashboard</h1>
          <p className="text-slate-600 mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-shefa-blue-100 rounded-lg">
                <CalendarDaysIcon className="w-6 h-6 text-shefa-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{todayEvents.length}</p>
                <p className="text-sm text-slate-500">Today</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ClockIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{tomorrowEvents.length}</p>
                <p className="text-sm text-slate-500">Tomorrow</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-xl p-5 shadow-sm border border-slate-200"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CalendarDaysIcon className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{thisWeekEvents.length}</p>
                <p className="text-sm text-slate-500">This Week</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Recently Requested Section */}
        {recentRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <UserPlusIcon className="w-5 h-5 text-purple-600" />
                Recently Requested
              </h2>
              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded-full">
                Last 3 days
              </span>
            </div>
            <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
              <div className="divide-y divide-slate-100">
                {recentRequests.map((event) => (
                  <Link
                    key={event.id}
                    href={`/event/${event.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-purple-50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{event.title}</p>
                      <p className="text-sm text-slate-500">
                        {format(parseISO(event.start_date), 'EEE, MMM d')} • {event.start_time} - {event.end_time}
                        {event.location && ` • ${event.location}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-purple-600">
                        Requested by
                      </p>
                      <p className="text-sm text-slate-600">
                        {(event as any).requested_by?.split('@')[0] || 'Unknown'}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {loadingEvents ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Today */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                  <span className="w-3 h-3 bg-shefa-blue-500 rounded-full animate-pulse" />
                  Today
                </h2>
                <span className="text-sm text-slate-500">{todayEvents.length} events</span>
              </div>
              <div className="space-y-3">
                {todayEvents.length === 0 ? (
                  <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
                    <p className="text-slate-500">No events today</p>
                  </div>
                ) : (
                  todayEvents.map((event) => (
                    <EventCard key={event.id} event={event} compact />
                  ))
                )}
              </div>
            </motion.div>

            {/* Tomorrow */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">Tomorrow</h2>
                <span className="text-sm text-slate-500">{tomorrowEvents.length} events</span>
              </div>
              <div className="space-y-3">
                {tomorrowEvents.length === 0 ? (
                  <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
                    <p className="text-slate-500">No events tomorrow</p>
                  </div>
                ) : (
                  tomorrowEvents.map((event) => (
                    <EventCard key={event.id} event={event} compact />
                  ))
                )}
              </div>
            </motion.div>

            {/* This Week */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-800">This Week</h2>
                <span className="text-sm text-slate-500">{thisWeekEvents.length} events</span>
              </div>
              <div className="space-y-3">
                {thisWeekEvents.length === 0 ? (
                  <div className="bg-white rounded-xl p-6 border border-slate-200 text-center">
                    <p className="text-slate-500">No other events this week</p>
                  </div>
                ) : (
                  thisWeekEvents.slice(0, 5).map((event) => (
                    <EventCard key={event.id} event={event} compact />
                  ))
                )}
                {thisWeekEvents.length > 5 && (
                  <Link
                    href="/events"
                    className="flex items-center justify-center gap-2 text-sm text-shefa-blue-600 hover:text-shefa-blue-700 font-medium py-2"
                  >
                    View all {thisWeekEvents.length} events
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                )}
              </div>
            </motion.div>
          </div>
        )}

      </main>
    </div>
  )
}
