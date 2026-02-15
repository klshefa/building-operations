'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, addDays, subDays, parseISO } from 'date-fns'
import { motion } from 'framer-motion'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  BuildingOfficeIcon,
  ClockIcon,
  CalendarDaysIcon,
  FunnelIcon,
  XMarkIcon,
  AcademicCapIcon,
  UserIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline'

interface RoomEvent {
  id: string
  title: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  all_day: boolean
  location: string | null
  resource_id: number
  is_hidden: boolean
  has_conflict: boolean
  is_class?: boolean
  teacher?: string
  day_pattern?: string
}

interface Room {
  id: number
  description: string
  abbreviation: string | null
  resource_type: string | null
  capacity: number | null
  events: RoomEvent[]
  totalEvents: number
  totalHours: number
}

// Time slots from 7am to 9pm
const TIME_SLOTS = Array.from({ length: 15 }, (_, i) => i + 7) // 7, 8, 9, ... 21

export default function RoomsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedClass, setSelectedClass] = useState<RoomEvent | null>(null)

  const dateStr = format(selectedDate, 'yyyy-MM-dd')

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchRooms()
    }
  }, [user, selectedDate, selectedType])

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

  async function fetchRooms() {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        startDate: dateStr,
        endDate: dateStr,
      })
      if (selectedType) {
        params.set('resourceType', selectedType)
      }
      
      const res = await fetch(`/api/rooms?${params}`)
      if (res.ok) {
        const data = await res.json()
        // Filter to rooms that have events on this day
        const roomsWithEvents = (data.rooms || []).filter((r: Room) => r.events.length > 0)
        setRooms(roomsWithEvents)
        setResourceTypes(data.resourceTypes || [])
      }
    } catch (err) {
      console.error('Error fetching rooms:', err)
    }
    setLoading(false)
  }

  function parseTimeToHour(time: string | null): number | null {
    if (!time) return null
    const match = time.match(/^(\d{1,2}):(\d{2})/)
    if (match) {
      return parseInt(match[1]) + parseInt(match[2]) / 60
    }
    return null
  }

  function formatHour(hour: number): string {
    const h = hour % 12 || 12
    const ampm = hour < 12 ? 'am' : 'pm'
    return `${h}${ampm}`
  }

  function formatTime(time: string | null): string {
    if (!time) return ''
    const match = time.match(/^(\d{1,2}):(\d{2})/)
    if (match) {
      const hour = parseInt(match[1])
      const minute = match[2]
      const ampm = hour >= 12 ? 'pm' : 'am'
      const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
      return `${hour12}:${minute}${ampm}`
    }
    return time
  }

  // Get events for a specific room that overlap with a time slot
  function getEventsForSlot(room: Room, slotHour: number): RoomEvent[] {
    return room.events.filter(event => {
      if (event.all_day) return false
      const startHour = parseTimeToHour(event.start_time)
      const endHour = parseTimeToHour(event.end_time)
      if (startHour === null) return false
      // Event overlaps this slot if it starts before slot+1 and ends after slot
      const effectiveEnd = endHour ?? startHour + 1
      return startHour < slotHour + 1 && effectiveEnd > slotHour
    })
  }

  // Check if event starts in this slot
  function eventStartsInSlot(event: RoomEvent, slotHour: number): boolean {
    const startHour = parseTimeToHour(event.start_time)
    if (startHour === null) return false
    return Math.floor(startHour) === slotHour
  }

  // Get all-day events for a room
  function getAllDayEvents(room: Room): RoomEvent[] {
    return room.events.filter(event => event.all_day || !event.start_time)
  }

  // Check if any room has all-day events
  const hasAnyAllDayEvents = rooms.some(r => getAllDayEvents(r).length > 0)

  // Calculate stats
  const totalRoomsInUse = rooms.length
  const totalEvents = rooms.reduce((sum, r) => sum + r.events.length, 0)
  const totalClasses = rooms.reduce((sum, r) => sum + r.events.filter(e => e.is_class).length, 0)
  const totalReservations = totalEvents - totalClasses

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
      
      <main className="max-w-[95vw] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Room Utilization</h1>
            <p className="text-slate-600 text-sm">Daily view of room bookings</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-4">
          <div className="p-3 flex flex-wrap items-center justify-between gap-3">
            {/* Date Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedDate(subDays(selectedDate, 1))}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-3 py-1.5 text-sm font-medium text-shefa-blue-600 hover:bg-shefa-blue-50 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRightIcon className="w-5 h-5 text-slate-600" />
              </button>
              <input
                type="date"
                value={dateStr}
                onChange={(e) => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
                className="ml-2 px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
              <span className="ml-2 text-lg font-semibold text-slate-800">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </span>
            </div>

            {/* Stats & Filters */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-shefa-blue-200"></span>
                  <span className="text-slate-600">{totalReservations} Reservations</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-purple-200"></span>
                  <span className="text-slate-600">{totalClasses} Classes</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-shefa-blue-500"
                >
                  <option value="">All Room Types</option>
                  {resourceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Room Grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <BuildingOfficeIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No rooms booked on this day</p>
            <p className="text-slate-400 text-sm mt-1">Try selecting a different date or room type</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-x-auto"
          >
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="p-2 text-left text-xs font-medium text-slate-500 border-b border-r border-slate-200 w-16 sticky left-0 bg-slate-50 z-10">
                    Time
                  </th>
                  {rooms.map(room => (
                    <th 
                      key={room.id} 
                      className="p-2 text-center text-xs font-medium text-slate-700 border-b border-r border-slate-200 min-w-[120px]"
                      title={room.description}
                    >
                      <div>{room.abbreviation || room.description?.slice(0, 15)}</div>
                      {room.capacity && (
                        <div className="text-slate-400 font-normal">Cap: {room.capacity}</div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* All-day events row */}
                {hasAnyAllDayEvents && (
                  <tr className="bg-amber-50">
                    <td className="p-2 text-xs text-slate-500 border-b border-r border-slate-200 sticky left-0 bg-amber-50 z-10">
                      All Day
                    </td>
                    {rooms.map(room => {
                      const allDayEvents = getAllDayEvents(room)
                      return (
                        <td key={room.id} className="p-1 border-b border-r border-slate-200 align-top">
                          {allDayEvents.map(event => (
                            <div
                              key={event.id}
                              onClick={() => event.is_class ? setSelectedClass(event) : router.push(`/event/${event.id}`)}
                              className={`text-xs p-1 mb-1 rounded truncate cursor-pointer ${
                                event.is_class
                                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                                  : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                              }`}
                              title={event.title}
                            >
                              {event.title}
                            </div>
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                )}
                
                {/* Time slot rows */}
                {TIME_SLOTS.map(hour => (
                  <tr key={hour} className={hour % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <td className={`p-2 text-xs text-slate-500 border-b border-r border-slate-200 sticky left-0 z-10 ${hour % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      {formatHour(hour)}
                    </td>
                    {rooms.map(room => {
                      const slotEvents = getEventsForSlot(room, hour)
                      return (
                        <td 
                          key={room.id} 
                          className="p-0 border-b border-r border-slate-200 align-top h-12 relative"
                        >
                          {slotEvents.map(event => {
                            const startsHere = eventStartsInSlot(event, hour)
                            if (!startsHere) return null // Only render where event starts
                            
                            const startHour = parseTimeToHour(event.start_time) || hour
                            const endHour = parseTimeToHour(event.end_time) || startHour + 1
                            const duration = endHour - startHour
                            const heightPx = Math.max(duration * 48, 20) // 48px per hour, min 20px
                            
                            return (
                              <div
                                key={event.id}
                                onClick={() => event.is_class ? setSelectedClass(event) : router.push(`/event/${event.id}`)}
                                className={`absolute left-0 right-0 mx-0.5 px-1 py-0.5 text-xs rounded overflow-hidden cursor-pointer ${
                                  event.has_conflict
                                    ? 'bg-red-100 text-red-700 border-l-2 border-red-500 hover:bg-red-200'
                                    : event.is_class
                                    ? 'bg-purple-100 text-purple-700 border-l-2 border-purple-400 hover:bg-purple-200'
                                    : 'bg-shefa-blue-100 text-shefa-blue-700 border-l-2 border-shefa-blue-400 hover:bg-shefa-blue-200'
                                }`}
                                style={{ 
                                  height: `${heightPx}px`,
                                  top: `${(startHour - hour) * 48}px`,
                                  zIndex: 5,
                                }}
                                title={`${event.title} (${formatTime(event.start_time)} - ${formatTime(event.end_time)})`}
                              >
                                <div className="font-medium truncate">{event.title}</div>
                                <div className="text-[10px] opacity-75">
                                  {formatTime(event.start_time)}
                                  {event.end_time && ` - ${formatTime(event.end_time)}`}
                                </div>
                              </div>
                            )
                          })}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-6 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-shefa-blue-100 border-l-2 border-shefa-blue-400"></span>
            Reservation
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-purple-100 border-l-2 border-purple-400"></span>
            Class
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-amber-100"></span>
            All Day
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-100 border-l-2 border-red-500"></span>
            Conflict
          </span>
        </div>
      </main>

      {/* Class Detail Modal */}
      {selectedClass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedClass(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="bg-purple-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AcademicCapIcon className="w-6 h-6" />
                <span className="font-semibold">Class Schedule</span>
              </div>
              <button onClick={() => setSelectedClass(null)} className="hover:bg-purple-700 p-1 rounded">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <h3 className="text-lg font-semibold text-slate-800">{selectedClass.title}</h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <ClockIcon className="w-4 h-4 text-slate-400" />
                  <span>
                    {formatTime(selectedClass.start_time)}
                    {selectedClass.end_time && ` - ${formatTime(selectedClass.end_time)}`}
                  </span>
                </div>
                
                {selectedClass.location && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <MapPinIcon className="w-4 h-4 text-slate-400" />
                    <span>{selectedClass.location}</span>
                  </div>
                )}
                
                {selectedClass.teacher && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    <span>{selectedClass.teacher}</span>
                  </div>
                )}
                
                {selectedClass.day_pattern && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <CalendarDaysIcon className="w-4 h-4 text-slate-400" />
                    <span>Days: {selectedClass.day_pattern}</span>
                  </div>
                )}
              </div>
              
              <p className="text-xs text-slate-400 pt-2 border-t border-slate-100">
                This is a recurring class from Veracross. Click outside to close.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
