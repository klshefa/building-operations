'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import Navbar from '@/components/Navbar'
import { StaffLookup, type StaffMember } from '@/components/StaffLookup'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { OpsUser, UserRole, TeamType } from '@/lib/types'
import {
  UserPlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  FunnelIcon,
  PlusIcon,
  CalendarDaysIcon,
  UsersIcon,
  CloudArrowDownIcon,
  MagnifyingGlassIcon,
  ClipboardDocumentListIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline'
import type { AuditLogEntry } from '@/lib/types'
import { AvailabilityCheck } from '@/components/AvailabilityCheck'
import { ResourceScheduleSidebar } from '@/components/ResourceScheduleSidebar'

type AdminTab = 'event' | 'users' | 'sync' | 'filters' | 'audit'

const tabs: { id: AdminTab; label: string; icon: React.ElementType }[] = [
  { id: 'event', label: 'Add Event', icon: CalendarDaysIcon },
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'sync', label: 'Data Sync', icon: CloudArrowDownIcon },
  { id: 'filters', label: 'Filters', icon: FunnelIcon },
  { id: 'audit', label: 'Audit Log', icon: ClipboardDocumentListIcon },
]

const roleOptions: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'program_director', label: 'Program Director' },
  { value: 'office', label: 'Office' },
  { value: 'it', label: 'IT' },
  { value: 'security', label: 'Security' },
  { value: 'facilities', label: 'Facilities' },
  { value: 'viewer', label: 'Viewer' },
]

const teamOptions: { value: TeamType; label: string }[] = [
  { value: 'program_director', label: 'Program Director' },
  { value: 'office', label: 'Office' },
  { value: 'it', label: 'IT' },
  { value: 'security', label: 'Security' },
  { value: 'facilities', label: 'Facilities' },
]

const filterTypeOptions = [
  { value: 'title_contains', label: 'Title contains' },
  { value: 'title_equals', label: 'Title equals' },
  { value: 'description_contains', label: 'Description contains' },
  { value: 'location_contains', label: 'Location contains' },
  { value: 'location_equals', label: 'Location equals' },
]

const QUICK_DURATIONS = [
  { label: '30 min', minutes: 30 },
  { label: '1 hr', minutes: 60 },
  { label: '1.5 hr', minutes: 90 },
  { label: '2 hr', minutes: 120 },
]

interface EventFilter {
  id: string
  name: string
  filter_type: string
  filter_value: string
  case_sensitive: boolean
  is_active: boolean
  created_at: string
}

export default function AdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [activeTab, setActiveTab] = useState<AdminTab>('event')
  const [users, setUsers] = useState<OpsUser[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<Record<string, { success: boolean; message: string }>>({})
  
  // Add user form
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [newRole, setNewRole] = useState<UserRole>('viewer')
  const [newTeams, setNewTeams] = useState<TeamType[]>([])
  const [adding, setAdding] = useState(false)
  
  // Filters
  const [filters, setFilters] = useState<EventFilter[]>([])
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [newFilterName, setNewFilterName] = useState('')
  const [newFilterType, setNewFilterType] = useState('title_contains')
  const [newFilterValue, setNewFilterValue] = useState('')
  const [addingFilter, setAddingFilter] = useState(false)
  const [applyingFilters, setApplyingFilters] = useState(false)
  const [filterStatus, setFilterStatus] = useState<{ success: boolean; message: string } | null>(null)
  
  // Manual Event
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventAllDay, setEventAllDay] = useState(false)
  const [addingEvent, setAddingEvent] = useState(false)
  const [eventStatus, setEventStatus] = useState<{ success: boolean; message: string } | null>(null)
  
  // Resource dropdown for location
  const [resources, setResources] = useState<{ id: number; description: string; resource_type?: string }[]>([])
  const [resourceTypes, setResourceTypes] = useState<string[]>([])
  const [selectedResourceType, setSelectedResourceType] = useState<string>('')
  const [resourcesLoading, setResourcesLoading] = useState(true)
  const [showLocationDropdown, setShowLocationDropdown] = useState(false)
  const [selectedResourceId, setSelectedResourceId] = useState<number | null>(null)
  const [quickDuration, setQuickDuration] = useState<number | null>(null)
  
  // Audit log
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(true)
  const [auditPage, setAuditPage] = useState(1)
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditEntityFilter, setAuditEntityFilter] = useState<string>('')
  const [auditActionFilter, setAuditActionFilter] = useState<string>('')

  useEffect(() => {
    fetchUserInfo()
  }, [])

  useEffect(() => {
    if (userRole === 'admin') {
      fetchUsers()
      fetchFilters()
      fetchResources()
    }
  }, [userRole])

  useEffect(() => {
    if (userRole === 'admin' && activeTab === 'audit') {
      fetchAuditLogs()
    }
  }, [userRole, activeTab, auditPage, auditEntityFilter, auditActionFilter])

  // Update end time when quick duration is selected
  useEffect(() => {
    if (quickDuration && eventStartTime) {
      const [hours, minutes] = eventStartTime.split(':').map(Number)
      const startDate = new Date()
      startDate.setHours(hours, minutes, 0, 0)
      const endDate = new Date(startDate.getTime() + quickDuration * 60000)
      const endHours = String(endDate.getHours()).padStart(2, '0')
      const endMins = String(endDate.getMinutes()).padStart(2, '0')
      setEventEndTime(`${endHours}:${endMins}`)
    }
  }, [quickDuration, eventStartTime])

  // Resolve resource ID when location changes (for typed entries)
  useEffect(() => {
    if (!eventLocation || resources.length === 0) {
      // Only clear if no location selected
      if (!eventLocation) setSelectedResourceId(null)
      return
    }
    const loc = eventLocation.toLowerCase()
    const match = resources.find(r => 
      r.description.toLowerCase() === loc ||
      r.description.toLowerCase().includes(loc) ||
      loc.includes(r.description.toLowerCase())
    )
    if (match && match.id !== selectedResourceId) {
      setSelectedResourceId(match.id)
    }
  }, [eventLocation, resources])

  async function fetchResources() {
    try {
      const response = await fetch('/api/resources')
      const { data } = await response.json()
      if (data) {
        setResources(data)
        // Extract unique resource types
        const types = [...new Set(data.map((r: any) => r.resource_type).filter(Boolean))] as string[]
        setResourceTypes(types)
      }
    } catch (err) {
      console.error('Error fetching resources:', err)
    }
    setResourcesLoading(false)
  }

  async function fetchUserInfo() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      router.push('/')
      return
    }
    setUser(session.user)
    
    try {
      const response = await fetch(`/api/auth/check-access?email=${encodeURIComponent(session.user.email!.toLowerCase())}`)
      const data = await response.json()
      setUserRole(data.role || null)
    } catch {
      setUserRole(null)
    }
    setAuthLoading(false)
  }

  async function fetchUsers() {
    try {
      const res = await fetch('/api/users')
      const { data, error } = await res.json()
      
      if (error) {
        console.error('Error fetching users:', error)
      } else {
        setUsers(data || [])
      }
    } catch (err) {
      console.error('Error fetching users:', err)
    }
    setLoading(false)
  }

  async function fetchFilters() {
    try {
      const res = await fetch('/api/filters')
      if (res.ok) {
        const { data } = await res.json()
        setFilters(data || [])
      }
    } catch (err) {
      console.error('Error fetching filters:', err)
    }
    setFiltersLoading(false)
  }

  async function fetchAuditLogs() {
    setAuditLoading(true)
    try {
      const params = new URLSearchParams({
        page: auditPage.toString(),
        limit: '25',
      })
      if (auditEntityFilter) params.set('entity_type', auditEntityFilter)
      if (auditActionFilter) params.set('action', auditActionFilter)
      
      const res = await fetch(`/api/audit?${params}`)
      if (res.ok) {
        const { data, total } = await res.json()
        setAuditLogs(data || [])
        setAuditTotal(total || 0)
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err)
    }
    setAuditLoading(false)
  }

  async function addFilter(e: React.FormEvent) {
    e.preventDefault()
    if (!newFilterName || !newFilterValue) return

    setAddingFilter(true)
    try {
      const res = await fetch('/api/filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newFilterName,
          filter_type: newFilterType,
          filter_value: newFilterValue,
          created_by: user?.email,
        }),
      })

      if (res.ok) {
        setNewFilterName('')
        setNewFilterValue('')
        setNewFilterType('title_contains')
        fetchFilters()
      } else {
        const err = await res.json()
        alert('Error adding filter: ' + err.error)
      }
    } catch (err) {
      console.error('Error adding filter:', err)
    }
    setAddingFilter(false)
  }

  async function toggleFilter(filterId: string, isActive: boolean) {
    try {
      await fetch('/api/filters', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: filterId, is_active: !isActive }),
      })
      fetchFilters()
    } catch (err) {
      console.error('Error toggling filter:', err)
    }
  }

  async function deleteFilter(filterId: string) {
    if (!confirm('Delete this filter?')) return

    try {
      await fetch(`/api/filters?id=${filterId}`, { method: 'DELETE' })
      fetchFilters()
    } catch (err) {
      console.error('Error deleting filter:', err)
    }
  }

  async function applyFilters() {
    setApplyingFilters(true)
    setFilterStatus(null)

    try {
      const res = await fetch('/api/filters/apply', { method: 'POST' })
      const data = await res.json()

      if (res.ok) {
        setFilterStatus({
          success: true,
          message: `Hidden ${data.hidden_count} events`,
        })
      } else {
        setFilterStatus({
          success: false,
          message: data.error || 'Failed to apply filters',
        })
      }
    } catch (err) {
      setFilterStatus({
        success: false,
        message: 'Network error',
      })
    }
    setApplyingFilters(false)
  }

  async function addManualEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!eventTitle || !eventDate) return

    setAddingEvent(true)
    setEventStatus(null)

    try {
      const res = await fetch('/api/events/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventTitle,
          description: eventDescription || null,
          start_date: eventDate,
          end_date: eventDate,
          start_time: eventAllDay ? null : eventStartTime || null,
          end_time: eventAllDay ? null : eventEndTime || null,
          all_day: eventAllDay,
          location: eventLocation || null,
          created_by: user?.email,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setEventStatus({ success: true, message: 'Event created successfully!' })
        setEventTitle('')
        setEventDescription('')
        setEventDate('')
        setEventStartTime('')
        setEventEndTime('')
        setEventLocation('')
        setEventAllDay(false)
      } else {
        setEventStatus({ success: false, message: data.error || 'Failed to create event' })
      }
    } catch (err) {
      setEventStatus({ success: false, message: 'Network error' })
    }
    setAddingEvent(false)
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedStaff) {
      alert('Please select a staff member')
      return
    }

    setAdding(true)
    
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: selectedStaff.email.toLowerCase().trim(),
          name: `${selectedStaff.first_name} ${selectedStaff.last_name}`,
          role: newRole,
          teams: newTeams,
        }),
      })
      
      const { error } = await res.json()

      if (error) {
        alert(error)
      } else {
        setSelectedStaff(null)
        setNewRole('viewer')
        setNewTeams([])
        fetchUsers()
      }
    } catch (err) {
      console.error('Error adding user:', err)
      alert('Error adding user')
    }
    
    setAdding(false)
  }

  async function toggleUserActive(userId: string, isActive: boolean) {
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, is_active: !isActive }),
      })
      
      const { error } = await res.json()
      if (error) {
        console.error('Error updating user:', error)
      } else {
        fetchUsers()
      }
    } catch (err) {
      console.error('Error updating user:', err)
    }
  }

  async function deleteUser(userId: string, email: string) {
    if (email === user?.email) {
      alert('You cannot delete yourself')
      return
    }
    
    if (!confirm(`Delete user ${email}?`)) return

    try {
      const res = await fetch(`/api/users?id=${userId}`, {
        method: 'DELETE',
      })
      
      const { error } = await res.json()
      if (error) {
        console.error('Error deleting user:', error)
      } else {
        fetchUsers()
      }
    } catch (err) {
      console.error('Error deleting user:', err)
    }
  }

  async function triggerSync(source: string) {
    setSyncing(source)
    setSyncStatus(prev => ({ ...prev, [source]: { success: false, message: 'Syncing...' } }))

    try {
      const response = await fetch(`/api/sync/${source}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await response.json()

      if (response.ok) {
        setSyncStatus(prev => ({
          ...prev,
          [source]: { success: true, message: data.message || 'Sync completed' },
        }))
      } else {
        setSyncStatus(prev => ({
          ...prev,
          [source]: { success: false, message: data.error || 'Sync failed' },
        }))
      }
    } catch (error) {
      setSyncStatus(prev => ({
        ...prev,
        [source]: { success: false, message: 'Network error' },
      }))
    }

    setSyncing(null)
  }

  function toggleTeam(team: TeamType) {
    setNewTeams(prev =>
      prev.includes(team)
        ? prev.filter(t => t !== team)
        : [...prev, team]
    )
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
      </div>
    )
  }

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl p-8 text-center">
            <h1 className="text-xl font-semibold text-slate-800">Access Denied</h1>
            <p className="text-slate-600 mt-2">Admin access required</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <Navbar />
        
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-6">Admin</h1>

          {/* Tab Navigation */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
            <div className="flex border-b border-slate-200">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'text-shefa-blue-600 border-b-2 border-shefa-blue-600 bg-shefa-blue-50/50'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* Add Event Tab */}
              {activeTab === 'event' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">Create Manual Event</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Add events that are not captured by any of the synced sources.
                    </p>
                  </div>

                  {eventStatus && (
                    <div className={`mb-4 p-3 rounded-lg ${eventStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {eventStatus.message}
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column - Form */}
                    <div className="lg:col-span-2">
                      <form onSubmit={addManualEvent} className="space-y-4">
                        {/* Resource Type Filter */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Resource Type
                          </label>
                          <select
                            value={selectedResourceType}
                            onChange={(e) => {
                              setSelectedResourceType(e.target.value)
                              setEventLocation('')
                              setSelectedResourceId(null)
                            }}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                          >
                            <option value="">All Types</option>
                            {resourceTypes.map(type => (
                              <option key={type} value={type}>{type}</option>
                            ))}
                          </select>
                        </div>

                        {/* Resource Selection */}
                        <div className="relative">
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Resource <span className="text-red-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              value={eventLocation}
                              onChange={(e) => {
                                setEventLocation(e.target.value)
                                setShowLocationDropdown(true)
                              }}
                              onFocus={() => setShowLocationDropdown(true)}
                              placeholder={resourcesLoading ? "Loading resources..." : "Type to search resources..."}
                              className="w-full px-3 py-2 pr-8 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                            />
                            <button
                              type="button"
                              onClick={() => setShowLocationDropdown(!showLocationDropdown)}
                              disabled={resourcesLoading || resources.length === 0}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          </div>
                          {showLocationDropdown && resources.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                              {resources
                                .filter(r => !selectedResourceType || r.resource_type === selectedResourceType)
                                .filter(r => r.description.toLowerCase().includes(eventLocation.toLowerCase()))
                                .slice(0, 50)
                                .map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => {
                                      setEventLocation(r.description)
                                      setSelectedResourceId(r.id)
                                      setShowLocationDropdown(false)
                                    }}
                                    className="w-full text-left px-3 py-2 hover:bg-shefa-blue-50 text-sm text-slate-700"
                                  >
                                    {r.description}
                                  </button>
                                ))}
                              {resources
                                .filter(r => !selectedResourceType || r.resource_type === selectedResourceType)
                                .filter(r => r.description.toLowerCase().includes(eventLocation.toLowerCase())).length === 0 && (
                                <div className="px-3 py-2 text-sm text-slate-500">
                                  No matches found
                                </div>
                              )}
                            </div>
                          )}
                          {resources.length > 0 && (
                            <p className="text-xs text-slate-400 mt-1">
                              {resources.filter(r => !selectedResourceType || r.resource_type === selectedResourceType).length} resources
                            </p>
                          )}
                        </div>

                        {/* Date & Time Row */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Date <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="date"
                              value={eventDate}
                              onChange={(e) => setEventDate(e.target.value)}
                              required
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              Start Time <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="time"
                              value={eventStartTime}
                              onChange={(e) => {
                                setEventStartTime(e.target.value)
                                setQuickDuration(null)
                              }}
                              disabled={eventAllDay}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              End Time <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="time"
                              value={eventEndTime}
                              onChange={(e) => {
                                setEventEndTime(e.target.value)
                                setQuickDuration(null)
                              }}
                              disabled={eventAllDay}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent disabled:bg-slate-100 disabled:text-slate-400"
                            />
                          </div>
                        </div>

                        {/* Quick Duration + All Day */}
                        <div className="flex items-center gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-700">Quick Duration:</span>
                            {QUICK_DURATIONS.map(({ label, minutes }) => (
                              <button
                                key={minutes}
                                type="button"
                                onClick={() => setQuickDuration(minutes)}
                                disabled={eventAllDay}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                  quickDuration === minutes
                                    ? 'bg-shefa-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50'
                                }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                          <label className="flex items-center gap-2 cursor-pointer ml-auto">
                            <input
                              type="checkbox"
                              checked={eventAllDay}
                              onChange={(e) => setEventAllDay(e.target.checked)}
                              className="w-4 h-4 text-shefa-blue-600 border-slate-300 rounded focus:ring-shefa-blue-500"
                            />
                            <span className="text-sm text-slate-700">All Day</span>
                          </label>
                        </div>

                        {/* Event Title */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Event Title <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={eventTitle}
                            onChange={(e) => setEventTitle(e.target.value)}
                            placeholder="e.g., Team Meeting, Parent Event..."
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-1">
                            Description
                          </label>
                          <textarea
                            value={eventDescription}
                            onChange={(e) => setEventDescription(e.target.value)}
                            placeholder="Optional event description..."
                            rows={2}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                          />
                        </div>

                        {/* Veracross Availability Check */}
                        {eventLocation && eventDate && !eventAllDay && eventStartTime && eventEndTime && (
                          <div className="p-3 bg-slate-50 rounded-lg">
                            <AvailabilityCheck
                              resourceId={selectedResourceId || undefined}
                              resourceName={eventLocation}
                              date={eventDate}
                              startTime={eventStartTime}
                              endTime={eventEndTime}
                            />
                          </div>
                        )}

                        <div className="flex justify-end pt-2">
                          <button
                            type="submit"
                            disabled={addingEvent}
                            className="bg-shefa-blue-600 hover:bg-shefa-blue-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                          >
                            <PlusIcon className="w-5 h-5" />
                            {addingEvent ? 'Creating...' : 'Create Event'}
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Right Column - Calendar Sidebar */}
                    <div className="lg:col-span-1">
                      {selectedResourceId && eventDate ? (
                        <ResourceScheduleSidebar
                          resourceId={selectedResourceId}
                          resourceName={eventLocation}
                          date={eventDate}
                        />
                      ) : (
                        <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                          <p className="text-slate-500 text-sm text-center">
                            Select a resource and date to see the schedule.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Users Tab */}
              {activeTab === 'users' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">User Management</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Manage who has access to the Building Operations portal.
                    </p>
                  </div>

                  {/* Add User Form */}
                  <form onSubmit={addUser} className="mb-6 p-4 bg-slate-50 rounded-lg">
                    <h3 className="text-sm font-medium text-slate-700 mb-3">Add New User</h3>
                    
                    {/* Staff Lookup */}
                    <div className="mb-3">
                      <label className="block text-xs text-slate-500 mb-1.5">Search Staff</label>
                      {selectedStaff ? (
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200">
                          <div>
                            <p className="font-medium text-slate-800">
                              {selectedStaff.first_name} {selectedStaff.last_name}
                            </p>
                            <p className="text-sm text-slate-500">{selectedStaff.email}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedStaff(null)}
                            className="text-slate-400 hover:text-slate-600 p-1"
                          >
                            <XCircleIcon className="w-5 h-5" />
                          </button>
                        </div>
                      ) : (
                        <StaffLookup
                          onSelect={(staff) => setSelectedStaff(staff)}
                          placeholder="Type to search staff by name or email..."
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1.5">Role</label>
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value as UserRole)}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                        >
                          {roleOptions.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1.5">Teams</label>
                        <div className="flex flex-wrap items-center gap-2">
                          {teamOptions.map(team => (
                            <button
                              key={team.value}
                              type="button"
                              onClick={() => toggleTeam(team.value)}
                              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                                newTeams.includes(team.value)
                                  ? 'bg-shefa-blue-600 text-white'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {team.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={adding || !selectedStaff}
                      className="mt-4 bg-shefa-blue-600 hover:bg-shefa-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <UserPlusIcon className="w-4 h-4" />
                      {adding ? 'Adding...' : 'Add User'}
                    </button>
                  </form>

                  {/* User List */}
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {users.map((u) => (
                        <div
                          key={u.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            u.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-800 truncate">{u.email}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                                {u.role.replace('_', ' ')}
                              </span>
                              {u.teams?.map(team => (
                                <span key={team} className="text-xs px-2 py-0.5 rounded-full bg-shefa-blue-100 text-shefa-blue-700 capitalize">
                                  {team.replace('_', ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => toggleUserActive(u.id, u.is_active)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                u.is_active
                                  ? 'text-green-600 hover:bg-green-50'
                                  : 'text-slate-400 hover:bg-slate-100'
                              }`}
                              title={u.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {u.is_active ? (
                                <CheckCircleIcon className="w-5 h-5" />
                              ) : (
                                <XCircleIcon className="w-5 h-5" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteUser(u.id, u.email)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Sync Tab */}
              {activeTab === 'sync' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">Data Sync</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Manually trigger data sync from BigQuery and Google Calendars.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {/* BigQuery Sources */}
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">BigQuery Sources</h3>
                      <div className="space-y-2">
                        {['resources', 'group-events', 'resource-reservations'].map((source) => (
                          <div key={source} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                            <span className="text-sm text-slate-700 capitalize">{source.replace('-', ' ')}</span>
                            <div className="flex items-center gap-2">
                              {syncStatus[source] && (
                                <span className={`text-xs ${syncStatus[source].success ? 'text-green-600' : 'text-red-600'}`}>
                                  {syncStatus[source].message}
                                </span>
                              )}
                              <button
                                onClick={() => triggerSync(source)}
                                disabled={syncing === source}
                                className="p-2 text-shefa-blue-600 hover:bg-shefa-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <ArrowPathIcon className={`w-4 h-4 ${syncing === source ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Google Calendars */}
                    <div className="p-4 bg-slate-50 rounded-lg">
                      <h3 className="text-sm font-medium text-slate-700 mb-3">Google Calendars</h3>
                      <div className="space-y-2">
                        {[
                          { id: 'calendar-staff', label: 'Staff Calendar' },
                          { id: 'calendar-ls', label: 'Lower School' },
                          { id: 'calendar-ms', label: 'Middle School' },
                        ].map((source) => (
                          <div key={source.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                            <span className="text-sm text-slate-700">{source.label}</span>
                            <div className="flex items-center gap-2">
                              {syncStatus[source.id] && (
                                <span className={`text-xs ${syncStatus[source.id].success ? 'text-green-600' : 'text-red-600'}`}>
                                  {syncStatus[source.id].message}
                                </span>
                              )}
                              <button
                                onClick={() => triggerSync(source.id)}
                                disabled={syncing === source.id}
                                className="p-2 text-shefa-blue-600 hover:bg-shefa-blue-50 rounded-lg transition-colors disabled:opacity-50"
                              >
                                <ArrowPathIcon className={`w-4 h-4 ${syncing === source.id ? 'animate-spin' : ''}`} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Full Sync Button */}
                    <button
                      onClick={() => triggerSync('all')}
                      disabled={syncing !== null}
                      className="w-full bg-shefa-blue-600 hover:bg-shefa-blue-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <ArrowPathIcon className={`w-5 h-5 ${syncing === 'all' ? 'animate-spin' : ''}`} />
                      Sync All Sources
                    </button>
                    
                    {syncStatus['all'] && (
                      <p className={`text-center text-sm ${syncStatus['all'].success ? 'text-green-600' : 'text-red-600'}`}>
                        {syncStatus['all'].message}
                      </p>
                    )}

                    {/* Veracross API Test */}
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="text-sm font-medium text-blue-800 mb-2">Real-Time Availability Check</h3>
                      <p className="text-xs text-blue-600 mb-3">
                        Test the Veracross API integration for checking resource availability.
                      </p>
                      <Link
                        href="/admin/availability-test"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        <MagnifyingGlassIcon className="w-4 h-4" />
                        Open Availability Test
                      </Link>
                    </div>

                    {/* Weekly Digest Test */}
                    <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <h3 className="text-sm font-medium text-amber-800 mb-2">Weekly Digest</h3>
                      <p className="text-xs text-amber-600 mb-3">
                        Manually trigger the weekly digest email. Normally runs every Monday at 7am.
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={async () => {
                            setSyncing('weekly-digest')
                            setSyncStatus(prev => ({ ...prev, 'weekly-digest': { success: false, message: 'Sending...' } }))
                            try {
                              const res = await fetch('/api/cron/weekly-digest', { method: 'POST' })
                              const data = await res.json()
                              if (res.ok) {
                                setSyncStatus(prev => ({ ...prev, 'weekly-digest': { success: true, message: `Sent to ${data.sent} users` } }))
                              } else {
                                setSyncStatus(prev => ({ ...prev, 'weekly-digest': { success: false, message: data.error || 'Failed' } }))
                              }
                            } catch {
                              setSyncStatus(prev => ({ ...prev, 'weekly-digest': { success: false, message: 'Network error' } }))
                            }
                            setSyncing(null)
                          }}
                          disabled={syncing === 'weekly-digest'}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                          <EnvelopeIcon className="w-4 h-4" />
                          {syncing === 'weekly-digest' ? 'Sending...' : 'Send Now'}
                        </button>
                        {syncStatus['weekly-digest'] && (
                          <span className={`text-sm ${syncStatus['weekly-digest'].success ? 'text-green-600' : 'text-red-600'}`}>
                            {syncStatus['weekly-digest'].message}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Filters Tab */}
              {activeTab === 'filters' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-800">Event Filters</h2>
                      <p className="text-sm text-slate-600 mt-1">
                        Create rules to automatically hide events matching certain criteria.
                      </p>
                    </div>
                    <button
                      onClick={applyFilters}
                      disabled={applyingFilters}
                      className="bg-amber-500 hover:bg-amber-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <ArrowPathIcon className={`w-4 h-4 ${applyingFilters ? 'animate-spin' : ''}`} />
                      Apply Now
                    </button>
                  </div>

                  {filterStatus && (
                    <div className={`mb-4 p-3 rounded-lg ${filterStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                      {filterStatus.message}
                    </div>
                  )}

                  {/* Add Filter Form */}
                  <form onSubmit={addFilter} className="mb-6 p-4 bg-slate-50 rounded-lg">
                    <h3 className="text-sm font-medium text-slate-700 mb-3">Add New Filter</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <input
                        type="text"
                        value={newFilterName}
                        onChange={(e) => setNewFilterName(e.target.value)}
                        placeholder="Filter name"
                        required
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                      />
                      <select
                        value={newFilterType}
                        onChange={(e) => setNewFilterType(e.target.value)}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                      >
                        {filterTypeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={newFilterValue}
                        onChange={(e) => setNewFilterValue(e.target.value)}
                        placeholder="Value to match"
                        required
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                      />
                      <button
                        type="submit"
                        disabled={addingFilter}
                        className="bg-shefa-blue-600 hover:bg-shefa-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <PlusIcon className="w-4 h-4" />
                        {addingFilter ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                  </form>

                  {/* Filter List */}
                  {filtersLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
                    </div>
                  ) : filters.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No filters configured</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {filters.map((filter) => (
                        <div
                          key={filter.id}
                          className={`flex items-center justify-between p-3 rounded-lg border ${
                            filter.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-800 truncate">{filter.name}</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                              {filterTypeOptions.find(f => f.value === filter.filter_type)?.label}: &quot;{filter.filter_value}&quot;
                            </p>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => toggleFilter(filter.id, filter.is_active)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                filter.is_active
                                  ? 'text-green-600 hover:bg-green-50'
                                  : 'text-slate-400 hover:bg-slate-100'
                              }`}
                              title={filter.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {filter.is_active ? (
                                <CheckCircleIcon className="w-5 h-5" />
                              ) : (
                                <XCircleIcon className="w-5 h-5" />
                              )}
                            </button>
                            <button
                              onClick={() => deleteFilter(filter.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Audit Log Tab */}
              {activeTab === 'audit' && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-800">Audit Log</h2>
                    <p className="text-sm text-slate-600 mt-1">
                      Track all changes made in Building Operations.
                    </p>
                  </div>

                  {/* Filters */}
                  <div className="flex gap-3 mb-4">
                    <select
                      value={auditEntityFilter}
                      onChange={(e) => { setAuditEntityFilter(e.target.value); setAuditPage(1) }}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500"
                    >
                      <option value="">All Entities</option>
                      <option value="ops_events">Events</option>
                      <option value="ops_users">Users</option>
                      <option value="ops_event_filters">Filters</option>
                      <option value="ops_event_matches">Event Matches</option>
                      <option value="event_subscriptions">Subscriptions</option>
                    </select>
                    <select
                      value={auditActionFilter}
                      onChange={(e) => { setAuditActionFilter(e.target.value); setAuditPage(1) }}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500"
                    >
                      <option value="">All Actions</option>
                      <option value="CREATE">Create</option>
                      <option value="UPDATE">Update</option>
                      <option value="DELETE">Delete</option>
                    </select>
                    <button
                      onClick={fetchAuditLogs}
                      className="px-3 py-2 text-shefa-blue-600 hover:bg-shefa-blue-50 rounded-lg transition-colors"
                    >
                      <ArrowPathIcon className={`w-5 h-5 ${auditLoading ? 'animate-spin' : ''}`} />
                    </button>
                  </div>

                  {/* Audit Log Table */}
                  {auditLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
                    </div>
                  ) : auditLogs.length === 0 ? (
                    <p className="text-center text-slate-500 py-8">No audit logs found</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="text-left py-3 px-3 font-medium text-slate-600">Time</th>
                              <th className="text-left py-3 px-3 font-medium text-slate-600">User</th>
                              <th className="text-left py-3 px-3 font-medium text-slate-600">Action</th>
                              <th className="text-left py-3 px-3 font-medium text-slate-600">Entity</th>
                              <th className="text-left py-3 px-3 font-medium text-slate-600">Changes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {auditLogs.map((log) => (
                              <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50">
                                <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                                  {new Date(log.created_at).toLocaleString()}
                                </td>
                                <td className="py-3 px-3 text-slate-800">
                                  {log.user_email?.split('@')[0] || '-'}
                                </td>
                                <td className="py-3 px-3">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    log.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                                    log.action === 'UPDATE' ? 'bg-blue-100 text-blue-700' :
                                    log.action === 'DELETE' ? 'bg-red-100 text-red-700' :
                                    'bg-slate-100 text-slate-700'
                                  }`}>
                                    {log.action}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-slate-600">
                                  <span className="text-xs">
                                    {log.entity_type.replace('ops_', '').replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="py-3 px-3 text-slate-600 max-w-xs">
                                  {log.changed_fields ? (
                                    <span className="text-xs">
                                      {Object.keys(log.changed_fields).join(', ')}
                                    </span>
                                  ) : log.action === 'CREATE' && log.new_values ? (
                                    <span className="text-xs text-green-600">
                                      {(log.new_values as any).title || (log.new_values as any).email || (log.new_values as any).name || 'New record'}
                                    </span>
                                  ) : log.action === 'DELETE' && log.old_values ? (
                                    <span className="text-xs text-red-600">
                                      {(log.old_values as any).title || (log.old_values as any).email || (log.old_values as any).name || 'Deleted'}
                                    </span>
                                  ) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-200">
                        <span className="text-sm text-slate-600">
                          Showing {((auditPage - 1) * 25) + 1} - {Math.min(auditPage * 25, auditTotal)} of {auditTotal}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setAuditPage(p => Math.max(1, p - 1))}
                            disabled={auditPage === 1}
                            className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50"
                          >
                            Previous
                          </button>
                          <button
                            onClick={() => setAuditPage(p => p + 1)}
                            disabled={auditPage * 25 >= auditTotal}
                            className="px-3 py-1 border border-slate-300 rounded text-sm disabled:opacity-50 hover:bg-slate-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        </main>
      </div>
  )
}
