'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, parseISO, addMonths, subMonths, isSameDay } from 'date-fns'
import AuthRequired from '@/components/AuthRequired'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import type { OpsEvent } from '@/lib/types'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline'

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    fetchEvents()
  }, [currentDate])

  async function fetchEvents() {
    setLoading(true)
    const supabase = createClient()
    const start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
    const end = format(endOfMonth(currentDate), 'yyyy-MM-dd')

    const { data, error } = await supabase
      .from('ops_events')
      .select('*')
      .gte('start_date', start)
      .lte('start_date', end)
      .eq('is_hidden', false)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      console.error('Error fetching events:', error)
    } else {
      setEvents(data || [])
    }
    setLoading(false)
  }

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  // Pad start of month to align with Sunday
  const startPadding = monthStart.getDay()
  const paddedDays = Array(startPadding).fill(null).concat(days)

  function getEventsForDay(date: Date) {
    return events.filter(e => isSameDay(parseISO(e.start_date), date))
  }

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : []

  return (
    <AuthRequired>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Navbar />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-slate-800">Calendar</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
              </button>
              <span className="text-lg font-semibold text-slate-800 min-w-[180px] text-center">
                {format(currentDate, 'MMMM yyyy')}
              </span>
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
              >
                <ChevronRightIcon className="w-5 h-5 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="ml-2 px-3 py-1.5 text-sm bg-shefa-blue-600 text-white rounded-lg hover:bg-shefa-blue-700 transition-colors"
              >
                Today
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Calendar Grid */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-4"
            >
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar days */}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {paddedDays.map((day, idx) => {
                    if (!day) {
                      return <div key={`pad-${idx}`} className="aspect-square" />
                    }

                    const dayEvents = getEventsForDay(day)
                    const isSelected = selectedDate && isSameDay(day, selectedDate)
                    const hasConflict = dayEvents.some(e => e.has_conflict && !e.conflict_ok)

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`aspect-square p-1 rounded-lg transition-all relative ${
                          isSelected
                            ? 'bg-shefa-blue-600 text-white'
                            : isToday(day)
                            ? 'bg-shefa-blue-50 text-shefa-blue-700'
                            : 'hover:bg-slate-100 text-slate-700'
                        } ${!isSameMonth(day, currentDate) ? 'opacity-50' : ''}`}
                      >
                        <span className="text-sm font-medium">{format(day, 'd')}</span>
                        {dayEvents.length > 0 && (
                          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-0.5">
                            {dayEvents.slice(0, 3).map((_, i) => (
                              <span
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isSelected ? 'bg-white' : hasConflict ? 'bg-red-500' : 'bg-shefa-blue-500'
                                }`}
                              />
                            ))}
                            {dayEvents.length > 3 && (
                              <span className={`text-[8px] ${isSelected ? 'text-white' : 'text-slate-500'}`}>
                                +{dayEvents.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </motion.div>

            {/* Selected Day Events */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
            >
              <h2 className="text-lg font-semibold text-slate-800 mb-4">
                {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}
              </h2>

              {selectedDate ? (
                selectedDayEvents.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">No events on this day</p>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto">
                    {selectedDayEvents.map(event => (
                      <div
                        key={event.id}
                        className={`p-3 rounded-lg border ${
                          event.has_conflict && !event.conflict_ok
                            ? 'bg-red-50 border-red-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <h3 className="font-medium text-slate-800">{event.title}</h3>
                        <div className="text-sm text-slate-500 mt-1">
                          {event.start_time && (
                            <span>{event.start_time}{event.end_time && ` - ${event.end_time}`}</span>
                          )}
                          {event.location && (
                            <span className="ml-2">• {event.location}</span>
                          )}
                        </div>
                        {/* Team indicators */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {event.needs_program_director && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">Program</span>
                          )}
                          {event.needs_office && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-pink-100 text-pink-700">Office</span>
                          )}
                          {event.needs_it && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 text-cyan-700">IT</span>
                          )}
                          {event.needs_security && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Security</span>
                          )}
                          {event.needs_facilities && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">Facilities</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="text-slate-500 text-center py-8">Click on a day to see events</p>
              )}
            </motion.div>
          </div>
        </main>
      </div>
    </AuthRequired>
  )
}
