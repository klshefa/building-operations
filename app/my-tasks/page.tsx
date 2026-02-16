'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { format, addDays } from 'date-fns'
import Navbar from '@/components/Navbar'
import EventCard from '@/components/EventCard'
import { createClient } from '@/lib/supabase/client'
import type { OpsEvent, TeamType } from '@/lib/types'
import {
  UserGroupIcon,
  BuildingOfficeIcon,
  ComputerDesktopIcon,
  ShieldCheckIcon,
  WrenchScrewdriverIcon,
  AtSymbolIcon,
  BellIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'

const teamIcons: Record<TeamType, React.ComponentType<{ className?: string }>> = {
  program_director: UserGroupIcon,
  office: BuildingOfficeIcon,
  it: ComputerDesktopIcon,
  security: ShieldCheckIcon,
  facilities: WrenchScrewdriverIcon,
}

const teamLabels: Record<TeamType, string> = {
  program_director: 'Program Director',
  office: 'Office',
  it: 'IT',
  security: 'Security',
  facilities: 'Facilities',
}

export default function MyTasksPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userTeams, setUserTeams] = useState<TeamType[]>([])
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [mentionedEvents, setMentionedEvents] = useState<OpsEvent[]>([])
  const [subscribedEvents, setSubscribedEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeam, setSelectedTeam] = useState<TeamType | 'all'>('all')

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchUserTeams()
      fetchEvents()
      fetchMentionedEvents()
      fetchSubscribedEvents()
    }
  }, [user])

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

  async function fetchUserTeams() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.email) {
      try {
        const response = await fetch(`/api/auth/check-access?email=${encodeURIComponent(session.user.email.toLowerCase())}`)
        const data = await response.json()
        setUserTeams(data.teams || [])
      } catch {
        setUserTeams([])
      }
    }
  }

  async function fetchEvents() {
    setLoading(true)
    const today = format(new Date(), 'yyyy-MM-dd')
    const nextMonth = format(addDays(new Date(), 30), 'yyyy-MM-dd')

    try {
      const res = await fetch(`/api/events?startDate=${today}&endDate=${nextMonth}&hideHidden=true`)
      if (res.ok) {
        const { data } = await res.json()
        setEvents(data || [])
      } else {
        console.error('Error fetching events')
      }
    } catch (err) {
      console.error('Error fetching events:', err)
    }
    setLoading(false)
  }

  async function fetchMentionedEvents() {
    if (!user?.email) return
    
    try {
      const res = await fetch(`/api/user/mentions?email=${encodeURIComponent(user.email)}`)
      if (res.ok) {
        const data = await res.json()
        console.log('[My Tasks] Mentioned events:', data)
        setMentionedEvents(data.events || [])
      } else {
        console.error('[My Tasks] Error fetching mentions:', await res.text())
        setMentionedEvents([])
      }
    } catch (err) {
      console.error('[My Tasks] Error fetching mentioned events:', err)
      setMentionedEvents([])
    }
  }

  async function fetchSubscribedEvents() {
    if (!user?.email) return
    
    try {
      const res = await fetch(`/api/user/subscriptions?email=${encodeURIComponent(user.email)}`)
      if (res.ok) {
        const data = await res.json()
        console.log('[My Tasks] Subscribed events:', data)
        setSubscribedEvents(data.events || [])
      } else {
        console.error('[My Tasks] Error fetching subscriptions:', await res.text())
        setSubscribedEvents([])
      }
    } catch (err) {
      console.error('[My Tasks] Error fetching subscribed events:', err)
      setSubscribedEvents([])
    }
  }

  // Filter events that need the user's team(s)
  const teamEvents = events.filter(event => {
    const teams = selectedTeam === 'all' ? userTeams : [selectedTeam]
    return teams.some(team => {
      switch (team) {
        case 'program_director': return event.needs_program_director
        case 'office': return event.needs_office
        case 'it': return event.needs_it
        case 'security': return event.needs_security
        case 'facilities': return event.needs_facilities
        default: return false
      }
    })
  })

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
            <h1 className="text-3xl font-bold text-slate-800">My Tasks</h1>
            
            {/* Team Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setSelectedTeam('all')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  selectedTeam === 'all'
                    ? 'bg-shefa-blue-600 text-white'
                    : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                }`}
              >
                All My Teams
              </button>
              {userTeams.map(team => {
                const Icon = teamIcons[team]
                return (
                  <button
                    key={team}
                    onClick={() => setSelectedTeam(team)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1.5 ${
                      selectedTeam === team
                        ? 'bg-shefa-blue-600 text-white'
                        : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {teamLabels[team]}
                  </button>
                )
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-8">
              {/* Team Assigned Events Section */}
              {teamEvents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200"
                >
                  <h2 className="text-lg font-semibold text-blue-800 mb-4 flex items-center gap-2">
                    <ClipboardDocumentListIcon className="w-5 h-5" />
                    Team Assigned ({teamEvents.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teamEvents.map(event => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Mentioned Events Section */}
              {mentionedEvents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-200"
                >
                  <h2 className="text-lg font-semibold text-purple-800 mb-4 flex items-center gap-2">
                    <AtSymbolIcon className="w-5 h-5" />
                    You Were Mentioned ({mentionedEvents.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {mentionedEvents.map(event => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Subscribed Events Section */}
              {subscribedEvents.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-200"
                >
                  <h2 className="text-lg font-semibold text-amber-800 mb-4 flex items-center gap-2">
                    <BellIcon className="w-5 h-5" />
                    Subscribed ({subscribedEvents.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subscribedEvents.map(event => (
                      <EventCard key={event.id} event={event} />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Empty State */}
              {teamEvents.length === 0 && mentionedEvents.length === 0 && subscribedEvents.length === 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-xl p-12 text-center border border-slate-200"
                >
                  <p className="text-slate-500">No events need your attention.</p>
                  {userTeams.length === 0 && (
                    <p className="text-sm text-slate-400 mt-2">Contact an admin to be added to a team.</p>
                  )}
                </motion.div>
              )}
            </div>
          )}
        </main>
      </div>
  )
}
