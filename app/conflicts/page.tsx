'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import type { OpsEvent } from '@/lib/types'
import {
  ExclamationTriangleIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'

interface ConflictPair {
  event_a: OpsEvent
  event_b: OpsEvent
  conflict_type: string
}

export default function ConflictsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [conflicts, setConflicts] = useState<ConflictPair[]>([])
  const [events, setEvents] = useState<OpsEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (user) {
      fetchConflicts()
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

  async function fetchConflicts() {
    setLoading(true)
    const supabase = createClient()
    const today = format(new Date(), 'yyyy-MM-dd')

    // Get events with conflicts
    const { data: eventsData, error: eventsError } = await supabase
      .from('ops_events')
      .select('*')
      .eq('has_conflict', true)
      .eq('conflict_ok', false)
      .gte('start_date', today)
      .eq('is_hidden', false)
      .order('start_date', { ascending: true })

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
    } else {
      setEvents(eventsData || [])
    }
    setLoading(false)
  }

  async function markConflictOk(eventId: string) {
    const supabase = createClient()
    const { error } = await supabase
      .from('ops_events')
      .update({ conflict_ok: true })
      .eq('id', eventId)

    if (error) {
      console.error('Error updating event:', error)
    } else {
      fetchConflicts()
    }
  }

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
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
              <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
              Conflicts
            </h1>
            <p className="text-slate-600 mt-1">
              Events that may have scheduling conflicts
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-white rounded-xl p-12 text-center border border-slate-200"
            >
              <CheckIcon className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium text-slate-700">No conflicts!</p>
              <p className="text-slate-500 mt-1">All events are clear of scheduling issues.</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {events.map(event => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 rounded-xl border border-red-200 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />
                        <h3 className="font-semibold text-slate-800">{event.title}</h3>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <p>
                          <span className="font-medium">Date:</span>{' '}
                          {format(parseISO(event.start_date), 'EEEE, MMMM d, yyyy')}
                        </p>
                        <p>
                          <span className="font-medium">Time:</span>{' '}
                          {event.start_time || 'All day'}
                          {event.end_time && ` - ${event.end_time}`}
                        </p>
                        {event.location && (
                          <p>
                            <span className="font-medium">Location:</span> {event.location}
                          </p>
                        )}
                        {event.conflict_notes && (
                          <p className="text-red-600">
                            <span className="font-medium">Conflict:</span> {event.conflict_notes}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => markConflictOk(event.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors"
                      >
                        <CheckIcon className="w-4 h-4" />
                        Mark OK
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </main>
      </div>
  )
}
