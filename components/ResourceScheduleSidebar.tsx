'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { ClockIcon } from '@heroicons/react/24/outline'

interface CalendarEvent {
  id: string
  title: string
  startTime: string | null
  endTime: string | null
  allDay: boolean
  type: 'reservation' | 'class' | 'calendar'
  source?: string
}

interface ResourceScheduleSidebarProps {
  resourceId: number | null
  resourceName?: string
  date: string | null
  className?: string
}

export function ResourceScheduleSidebar({
  resourceId,
  resourceName,
  date,
  className = '',
}: ResourceScheduleSidebarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState<string>('')

  const fetchCalendar = useCallback(async () => {
    if (!resourceId || !date) {
      setEvents([])
      return
    }

    // Avoid duplicate fetches
    const fetchKey = `${resourceId}-${date}`
    if (fetchKey === lastFetched) return

    setLoading(true)
    setLastFetched(fetchKey)

    try {
      const res = await fetch(`/api/resources/${resourceId}/calendar?date=${date}`)
      if (res.ok) {
        const data = await res.json()
        setEvents(data.events || [])
      }
    } catch (err) {
      console.error('Error fetching calendar:', err)
    }
    setLoading(false)
  }, [resourceId, date, lastFetched])

  // Fetch when inputs change (with debounce)
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCalendar()
    }, 300)
    return () => clearTimeout(timer)
  }, [resourceId, date])

  // Force refresh function for external use
  const refresh = useCallback(() => {
    setLastFetched('')
    fetchCalendar()
  }, [fetchCalendar])

  if (!resourceId || !date) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`}>
        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <ClockIcon className="w-5 h-5" />
          Schedule
        </h3>
        <p className="text-slate-500 text-sm">
          Select a location and date to see the schedule.
        </p>
      </div>
    )
  }

  const formattedDate = date ? format(parseISO(date), 'MMM d') : 'Selected Date'
  const allDayEvents = events.filter(e => e.allDay)
  const timedEvents = events.filter(e => !e.allDay)

  return (
    <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
        <ClockIcon className="w-5 h-5" />
        Schedule for {formattedDate}
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <p className="text-slate-500 text-sm py-4 text-center">
          No events scheduled for this location on this date.
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {/* All-day events first */}
          {allDayEvents.map(event => (
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
          {timedEvents.map(event => (
            <div
              key={event.id}
              className={`p-3 rounded-lg text-sm ${
                event.type === 'class'
                  ? 'bg-amber-50 border border-amber-200'
                  : event.type === 'reservation'
                  ? 'bg-blue-50 border border-blue-200'
                  : 'bg-purple-50 border border-purple-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <p className="font-medium">{event.title}</p>
                {event.type === 'class' && (
                  <span className="text-xs bg-amber-200 text-amber-800 px-1.5 py-0.5 rounded">
                    Class
                  </span>
                )}
                {event.type === 'reservation' && (
                  <span className="text-xs bg-blue-200 text-blue-800 px-1.5 py-0.5 rounded">
                    Reservation
                  </span>
                )}
                {event.type === 'calendar' && (
                  <span className="text-xs bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded">
                    Event
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
      {events.length > 0 && (
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
  )
}
