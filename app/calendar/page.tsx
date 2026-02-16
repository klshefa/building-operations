'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { motion } from 'framer-motion'
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek,
  endOfWeek,
  eachDayOfInterval, 
  isSameMonth, 
  isToday, 
  parseISO, 
  addMonths, 
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isSameDay 
} from 'date-fns'
import Navbar from '@/components/Navbar'
import EventCard from '@/components/EventCard'
import type { OpsEvent, EventSource } from '@/lib/types'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarDaysIcon,
  Squares2X2Icon,
  ViewColumnsIcon,
  UserGroupIcon,
  BuildingOfficeIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline'

type ViewMode = 'month' | 'week' | 'day'

const sourceColors: Record<EventSource, string> = {
  bigquery_group: 'bg-purple-100 text-purple-700',
  bigquery_resource: 'bg-blue-100 text-blue-700',
  calendar_staff: 'bg-amber-100 text-amber-700',
  calendar_ls: 'bg-green-100 text-green-700',
  calendar_ms: 'bg-teal-100 text-teal-700',
  manual: 'bg-slate-100 text-slate-700',
}

const sourceLabels: Record<EventSource, string> = {
  bigquery_group: 'VC Event',
  bigquery_resource: 'VC Resource',
  calendar_staff: 'Staff Cal',
  calendar_ls: 'LS Cal',
  calendar_ms: 'MS Cal',
  manual: 'Manual',
}

export default function CalendarPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchEvents()
    }
  }, [user, currentDate, viewMode])

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
    
    let start: string
    let end: string
    
    if (viewMode === 'month') {
      start = format(startOfMonth(currentDate), 'yyyy-MM-dd')
      end = format(endOfMonth(currentDate), 'yyyy-MM-dd')
    } else if (viewMode === 'week') {
      start = format(startOfWeek(currentDate), 'yyyy-MM-dd')
      end = format(endOfWeek(currentDate), 'yyyy-MM-dd')
    } else {
      start = format(currentDate, 'yyyy-MM-dd')
      end = format(currentDate, 'yyyy-MM-dd')
    }

    try {
      const res = await fetch(`/api/events?startDate=${start}&endDate=${end}&hideHidden=true`)
      if (res.ok) {
        const { data } = await res.json()
        setEvents(data || [])
      }
    } catch (err) {
      console.error('Error fetching events:', err)
    }
    setLoading(false)
  }

  function navigate(direction: 'prev' | 'next') {
    if (viewMode === 'month') {
      setCurrentDate(direction === 'prev' ? subMonths(currentDate, 1) : addMonths(currentDate, 1))
    } else if (viewMode === 'week') {
      setCurrentDate(direction === 'prev' ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1))
    } else {
      setCurrentDate(direction === 'prev' ? subDays(currentDate, 1) : addDays(currentDate, 1))
    }
  }

  function getEventsForDay(date: Date) {
    return events.filter(e => isSameDay(parseISO(e.start_date), date))
  }

  function getHeaderText() {
    if (viewMode === 'month') {
      return format(currentDate, 'MMMM yyyy')
    } else if (viewMode === 'week') {
      const weekStart = startOfWeek(currentDate)
      const weekEnd = endOfWeek(currentDate)
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`
    } else {
      return format(currentDate, 'EEEE, MMMM d, yyyy')
    }
  }

  // Month view data
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startPadding = monthStart.getDay()
  const paddedMonthDays = Array(startPadding).fill(null).concat(monthDays)

  // Week view data
  const weekStart = startOfWeek(currentDate)
  const weekEnd = endOfWeek(currentDate)
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })

  const selectedDayEvents = selectedDate ? getEventsForDay(selectedDate) : []

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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <h1 className="text-3xl font-bold text-slate-800">Calendar</h1>
            
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-white rounded-lg border border-slate-200 p-1">
                <button
                  onClick={() => setViewMode('month')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'month' ? 'bg-shefa-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Month view"
                >
                  <Squares2X2Icon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'week' ? 'bg-shefa-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Week view"
                >
                  <ViewColumnsIcon className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('day')}
                  className={`p-2 rounded-md transition-colors ${
                    viewMode === 'day' ? 'bg-shefa-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Day view"
                >
                  <CalendarDaysIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={() => navigate('prev')}
                  className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
                </button>
                <span className="text-base sm:text-lg font-semibold text-slate-800 min-w-[120px] sm:min-w-[180px] text-center">
                  {getHeaderText()}
                </span>
                <button
                  onClick={() => navigate('next')}
                  className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  <ChevronRightIcon className="w-5 h-5 text-slate-600" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="ml-1 sm:ml-2 px-2 sm:px-3 py-1.5 text-sm bg-shefa-blue-600 text-white rounded-lg hover:bg-shefa-blue-700 transition-colors"
                >
                  Today
                </button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
            </div>
          ) : viewMode === 'month' ? (
            /* Month View */
            <div className="flex flex-col lg:flex-row gap-6" style={{ height: 'calc(100vh - 180px)' }}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col"
              >
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                    <div key={day} className="text-center text-sm font-medium text-slate-500 py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar days - rows expand to fill height */}
                <div 
                  className="grid grid-cols-7 gap-1 flex-1"
                  style={{ gridTemplateRows: 'repeat(6, 1fr)' }}
                >
                  {paddedMonthDays.map((day, idx) => {
                    if (!day) {
                      return <div key={`pad-${idx}`} />
                    }

                    const dayEvents = getEventsForDay(day)
                    const isSelected = selectedDate && isSameDay(day, selectedDate)

                    return (
                      <button
                        key={day.toISOString()}
                        onClick={() => setSelectedDate(day)}
                        className={`p-2 rounded-lg transition-all flex flex-col h-full ${
                          isSelected
                            ? 'bg-shefa-blue-600 text-white'
                            : isToday(day)
                            ? 'bg-shefa-blue-50 text-shefa-blue-700 ring-2 ring-shefa-blue-300'
                            : 'hover:bg-slate-100 text-slate-700'
                        } ${!isSameMonth(day, currentDate) ? 'opacity-40' : ''}`}
                      >
                        <span className={`text-sm font-semibold ${isToday(day) && !isSelected ? 'bg-shefa-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : ''}`}>
                          {format(day, 'd')}
                        </span>
                        {dayEvents.length > 0 && (
                          <div className="mt-auto flex flex-wrap gap-0.5 justify-center">
                            {dayEvents.slice(0, 4).map((_, i) => (
                              <span
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  isSelected ? 'bg-white' : 'bg-shefa-blue-500'
                                }`}
                              />
                            ))}
                            {dayEvents.length > 4 && (
                              <span className={`text-xs font-medium ml-0.5 ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>
                                +{dayEvents.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </motion.div>

              {/* Selected Day Events Sidebar */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="w-full lg:w-96 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col"
              >
                <h2 className="text-lg font-semibold text-slate-800 mb-4">
                  {selectedDate ? format(selectedDate, 'EEEE, MMMM d') : 'Select a day'}
                </h2>

                {selectedDate ? (
                  selectedDayEvents.length === 0 ? (
                    <p className="text-slate-500 text-center py-8">No events on this day</p>
                  ) : (
                    <div className="space-y-3 overflow-y-auto flex-1">
                      {selectedDayEvents.map(event => (
                        <EventCard key={event.id} event={event} compact />
                      ))}
                    </div>
                  )
                ) : (
                  <p className="text-slate-500 text-center py-8">Click on a day to see events</p>
                )}
              </motion.div>
            </div>
          ) : viewMode === 'week' ? (
            /* Week View */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto"
            >
              <div className="min-w-[640px]">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-slate-200">
                {weekDays.map(day => (
                  <div 
                    key={day.toISOString()} 
                    className={`text-center py-3 border-r last:border-r-0 border-slate-200 ${
                      isToday(day) ? 'bg-shefa-blue-50' : ''
                    }`}
                  >
                    <div className="text-xs font-medium text-slate-500">{format(day, 'EEE')}</div>
                    <div className={`text-lg font-semibold ${isToday(day) ? 'text-shefa-blue-600' : 'text-slate-800'}`}>
                      {format(day, 'd')}
                    </div>
                  </div>
                ))}
              </div>

              {/* Events grid */}
              <div className="grid grid-cols-7 min-h-[500px]">
                {weekDays.map(day => {
                  const dayEvents = getEventsForDay(day)
                  return (
                    <div 
                      key={day.toISOString()} 
                      className={`border-r last:border-r-0 border-slate-200 p-2 ${
                        isToday(day) ? 'bg-shefa-blue-50/30' : ''
                      }`}
                    >
                      <div className="space-y-2">
                        {dayEvents.map(event => {
                          const hasTeams = event.needs_program_director || event.needs_office || event.needs_it || event.needs_security || event.needs_facilities
                          return (
                            <div
                              key={event.id}
                              onClick={() => router.push(`/event/${event.id}${event.id.startsWith('vc-res-') ? `?date=${event.start_date}` : ''}`)}
                              className="p-2 rounded-lg text-xs cursor-pointer hover:opacity-80 transition-opacity bg-slate-100 border border-slate-200 hover:bg-slate-200"
                            >
                              <div className="font-medium text-slate-800 truncate">{event.title}</div>
                              {event.start_time && (
                                <div className="text-slate-500 mt-0.5">{event.start_time}</div>
                              )}
                              <div className="flex flex-wrap gap-0.5 mt-1">
                                {(event.sources?.length > 0 ? event.sources : [event.primary_source]).map(source => (
                                  <span key={source} className={`text-[8px] px-1 py-0.5 rounded ${sourceColors[source]}`}>
                                    {sourceLabels[source]}
                                  </span>
                                ))}
                              </div>
                              {hasTeams && (
                                <div className="flex flex-wrap gap-0.5 mt-1">
                                  {event.needs_program_director && <UserGroupIcon className="w-3 h-3 text-indigo-600" title="Program" />}
                                  {event.needs_office && <BuildingOfficeIcon className="w-3 h-3 text-pink-600" title="Office" />}
                                  {event.needs_it && <ComputerDesktopIcon className="w-3 h-3 text-cyan-600" title="IT" />}
                                  {event.needs_security && <ShieldCheckIcon className="w-3 h-3 text-amber-600" title="Security" />}
                                  {event.needs_facilities && <WrenchScrewdriverIcon className="w-3 h-3 text-emerald-600" title="Facilities" />}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {dayEvents.length === 0 && (
                          <div className="text-xs text-slate-400 text-center py-4">No events</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              </div>
            </motion.div>
          ) : (
            /* Day View */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
            >
              <div className="space-y-4">
                {events.length === 0 ? (
                  <div className="text-center py-12">
                    <CalendarDaysIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No events on this day</p>
                  </div>
                ) : (
                  events.map(event => (
                    <EventCard key={event.id} event={event} />
                  ))
                )}
              </div>
            </motion.div>
          )}
        </main>
      </div>
  )
}
