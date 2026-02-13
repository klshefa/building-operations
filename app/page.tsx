'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { format, isToday, isTomorrow, isThisWeek, addDays, parseISO } from 'date-fns'
import AuthRequired from '@/components/AuthRequired'
import Navbar from '@/components/Navbar'
import EventCard from '@/components/EventCard'
import type { OpsEvent } from '@/lib/types'
import {
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import Link from 'next/link'

export default function DashboardPage() {
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [conflictCount, setConflictCount] = useState(0)

  useEffect(() => {
    fetchEvents()
  }, [])

  async function fetchEvents() {
    const today = format(new Date(), 'yyyy-MM-dd')
    const weekEnd = format(addDays(new Date(), 7), 'yyyy-MM-dd')

    try {
      const res = await fetch(`/api/events?startDate=${today}&endDate=${weekEnd}&hideHidden=true`)
      if (res.ok) {
        const { data } = await res.json()
        setEvents(data || [])
        setConflictCount(data?.filter((e: OpsEvent) => e.has_conflict && !e.conflict_ok).length || 0)
      } else {
        console.error('Error fetching events:', await res.text())
      }
    } catch (err) {
      console.error('Error fetching events:', err)
    }
    setLoading(false)
  }

  const todayEvents = events.filter(e => isToday(parseISO(e.start_date)))
  const tomorrowEvents = events.filter(e => isTomorrow(parseISO(e.start_date)))
  const thisWeekEvents = events.filter(e => {
    const date = parseISO(e.start_date)
    return isThisWeek(date) && !isToday(date) && !isTomorrow(date)
  })

  return (
    <AuthRequired>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
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

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={`rounded-xl p-5 shadow-sm border ${
                conflictCount > 0
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-slate-200'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${conflictCount > 0 ? 'bg-red-100' : 'bg-slate-100'}`}>
                  <ExclamationTriangleIcon className={`w-6 h-6 ${conflictCount > 0 ? 'text-red-600' : 'text-slate-400'}`} />
                </div>
                <div>
                  <p className={`text-2xl font-bold ${conflictCount > 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {conflictCount}
                  </p>
                  <p className="text-sm text-slate-500">Conflicts</p>
                </div>
              </div>
            </motion.div>
          </div>

          {loading ? (
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

          {/* Conflicts Section */}
          {conflictCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-8"
            >
              <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-red-800 flex items-center gap-2">
                    <ExclamationTriangleIcon className="w-5 h-5" />
                    Unresolved Conflicts
                  </h2>
                  <Link
                    href="/conflicts"
                    className="text-sm text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
                  >
                    View All
                    <ArrowRightIcon className="w-4 h-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {events
                    .filter(e => e.has_conflict && !e.conflict_ok)
                    .slice(0, 4)
                    .map(event => (
                      <EventCard key={event.id} event={event} compact />
                    ))
                  }
                </div>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </AuthRequired>
  )
}
