'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, parseISO, isSameDay } from 'date-fns'
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

type ViewMode = 'grid' | 'list'

export default function RoomsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 0 }))
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [expandedRoom, setExpandedRoom] = useState<number | null>(null)

  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 0 })
  const daysOfWeek = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchRooms()
    }
  }, [user, currentWeekStart, selectedType])

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
        startDate: format(currentWeekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
      })
      if (selectedType) {
        params.set('resourceType', selectedType)
      }
      
      const res = await fetch(`/api/rooms?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRooms(data.rooms || [])
        setResourceTypes(data.resourceTypes || [])
      }
    } catch (err) {
      console.error('Error fetching rooms:', err)
    }
    setLoading(false)
  }

  function getEventsForDay(room: Room, date: Date): RoomEvent[] {
    return room.events.filter(event => {
      const eventDate = parseISO(event.start_date)
      return isSameDay(eventDate, date)
    })
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

  // Calculate overall stats
  const totalRooms = rooms.length
  const totalEventsThisWeek = rooms.reduce((sum, r) => sum + r.totalEvents, 0)
  const totalHoursThisWeek = rooms.reduce((sum, r) => sum + r.totalHours, 0)
  const mostUsedRoom = rooms.reduce((max, r) => r.totalEvents > (max?.totalEvents || 0) ? r : max, null as Room | null)

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-800">Room Utilization</h1>
            <p className="text-slate-600 mt-1">View room bookings and availability</p>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <BuildingOfficeIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalRooms}</p>
                <p className="text-xs text-slate-500">Total Rooms</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CalendarDaysIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalEventsThisWeek}</p>
                <p className="text-xs text-slate-500">Events This Week</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ClockIcon className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{Math.round(totalHoursThisWeek)}</p>
                <p className="text-xs text-slate-500">Hours Booked</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <BuildingOfficeIcon className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 truncate" title={mostUsedRoom?.description}>
                  {mostUsedRoom?.abbreviation || mostUsedRoom?.description?.slice(0, 15) || '-'}
                </p>
                <p className="text-xs text-slate-500">Most Used</p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
          <div className="p-4 flex flex-wrap items-center justify-between gap-4">
            {/* Week Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentWeekStart(subWeeks(currentWeekStart, 1))}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeftIcon className="w-5 h-5 text-slate-600" />
              </button>
              <button
                onClick={() => setCurrentWeekStart(startOfWeek(new Date(), { weekStartsOn: 0 }))}
                className="px-3 py-1.5 text-sm font-medium text-shefa-blue-600 hover:bg-shefa-blue-50 rounded-lg transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => setCurrentWeekStart(addWeeks(currentWeekStart, 1))}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRightIcon className="w-5 h-5 text-slate-600" />
              </button>
              <span className="ml-2 text-sm font-medium text-slate-700">
                {format(currentWeekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
              </span>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-shefa-blue-500"
                >
                  <option value="">All Types</option>
                  {resourceTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              
              {/* View Toggle */}
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === 'grid' ? 'bg-white shadow text-slate-800' : 'text-slate-600'
                  }`}
                >
                  Grid
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    viewMode === 'list' ? 'bg-white shadow text-slate-800' : 'text-slate-600'
                  }`}
                >
                  List
                </button>
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
            <p className="text-slate-500">No rooms found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
          >
            {/* Header Row */}
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50">
              <div className="p-3 font-medium text-slate-600 text-sm">Room</div>
              {daysOfWeek.map(day => (
                <div
                  key={day.toISOString()}
                  className={`p-3 text-center border-l border-slate-200 ${
                    isSameDay(day, new Date()) ? 'bg-shefa-blue-50' : ''
                  }`}
                >
                  <p className="text-xs text-slate-500">{format(day, 'EEE')}</p>
                  <p className={`text-sm font-medium ${
                    isSameDay(day, new Date()) ? 'text-shefa-blue-600' : 'text-slate-700'
                  }`}>
                    {format(day, 'd')}
                  </p>
                </div>
              ))}
            </div>

            {/* Room Rows */}
            <div className="divide-y divide-slate-100">
              {rooms.filter(r => r.totalEvents > 0 || selectedType).map(room => (
                <div key={room.id} className="grid grid-cols-8 hover:bg-slate-50">
                  <div className="p-3 flex items-start">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate" title={room.description}>
                        {room.abbreviation || room.description}
                      </p>
                      {room.capacity && (
                        <p className="text-xs text-slate-500">Cap: {room.capacity}</p>
                      )}
                    </div>
                  </div>
                  {daysOfWeek.map(day => {
                    const dayEvents = getEventsForDay(room, day)
                    return (
                      <div
                        key={day.toISOString()}
                        className={`p-2 border-l border-slate-200 min-h-[60px] ${
                          isSameDay(day, new Date()) ? 'bg-shefa-blue-50/50' : ''
                        }`}
                      >
                        {dayEvents.slice(0, 3).map(event => (
                          <div
                            key={event.id}
                            onClick={() => router.push(`/event/${event.id}`)}
                            className={`text-xs p-1 mb-1 rounded cursor-pointer truncate ${
                              event.has_conflict
                                ? 'bg-red-100 text-red-700'
                                : 'bg-shefa-blue-100 text-shefa-blue-700 hover:bg-shefa-blue-200'
                            }`}
                            title={`${event.title}${event.start_time ? ` - ${formatTime(event.start_time)}` : ''}`}
                          >
                            {event.start_time && (
                              <span className="font-medium">{formatTime(event.start_time)} </span>
                            )}
                            {event.title.slice(0, 20)}
                          </div>
                        ))}
                        {dayEvents.length > 3 && (
                          <p className="text-xs text-slate-500 text-center">
                            +{dayEvents.length - 3} more
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          /* List View */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-3"
          >
            {rooms.filter(r => r.totalEvents > 0 || selectedType).map(room => (
              <div
                key={room.id}
                className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedRoom(expandedRoom === room.id ? null : room.id)}
                  className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <BuildingOfficeIcon className="w-5 h-5 text-slate-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-slate-800">{room.description}</p>
                      <p className="text-sm text-slate-500">
                        {room.resource_type && `${room.resource_type} • `}
                        {room.capacity && `Capacity: ${room.capacity}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-800">{room.totalEvents}</p>
                      <p className="text-xs text-slate-500">events</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-800">{room.totalHours}</p>
                      <p className="text-xs text-slate-500">hours</p>
                    </div>
                    <ChevronRightIcon
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        expandedRoom === room.id ? 'rotate-90' : ''
                      }`}
                    />
                  </div>
                </button>
                
                {expandedRoom === room.id && room.events.length > 0 && (
                  <div className="border-t border-slate-200 p-4 bg-slate-50">
                    <div className="space-y-2">
                      {room.events.map(event => (
                        <div
                          key={event.id}
                          onClick={() => router.push(`/event/${event.id}`)}
                          className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 cursor-pointer hover:border-shefa-blue-300 transition-colors"
                        >
                          <div>
                            <p className="font-medium text-slate-800">{event.title}</p>
                            <p className="text-sm text-slate-500">
                              {format(parseISO(event.start_date), 'EEE, MMM d')}
                              {event.start_time && ` • ${formatTime(event.start_time)}`}
                              {event.end_time && ` - ${formatTime(event.end_time)}`}
                            </p>
                          </div>
                          {event.has_conflict && (
                            <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                              Conflict
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </main>
    </div>
  )
}
