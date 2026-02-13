'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import AuthRequired from '@/components/AuthRequired'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import type { OpsUser, UserRole, TeamType } from '@/lib/types'
import {
  UserPlusIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'

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

export default function AdminPage() {
  const { userRole, user } = useAuth()
  const [users, setUsers] = useState<OpsUser[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<Record<string, { success: boolean; message: string }>>({})
  
  // Add user form
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('viewer')
  const [newTeams, setNewTeams] = useState<TeamType[]>([])
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (userRole === 'admin') {
      fetchUsers()
    }
  }, [userRole])

  async function fetchUsers() {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('ops_users')
      .select('*')
      .order('email')

    if (error) {
      console.error('Error fetching users:', error)
    } else {
      setUsers(data || [])
    }
    setLoading(false)
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault()
    if (!newEmail.endsWith('@shefaschool.org')) {
      alert('Email must be @shefaschool.org')
      return
    }

    setAdding(true)
    const supabase = createClient()
    
    const { error } = await supabase
      .from('ops_users')
      .insert({
        email: newEmail.toLowerCase(),
        name: newName || null,
        role: newRole,
        teams: newTeams,
        is_active: true,
      })

    if (error) {
      console.error('Error adding user:', error)
      alert('Error adding user: ' + error.message)
    } else {
      setNewEmail('')
      setNewName('')
      setNewRole('viewer')
      setNewTeams([])
      fetchUsers()
    }
    setAdding(false)
  }

  async function toggleUserActive(userId: string, isActive: boolean) {
    const supabase = createClient()
    const { error } = await supabase
      .from('ops_users')
      .update({ is_active: !isActive })
      .eq('id', userId)

    if (error) {
      console.error('Error updating user:', error)
    } else {
      fetchUsers()
    }
  }

  async function deleteUser(userId: string, email: string) {
    if (email === user?.email) {
      alert('You cannot delete yourself')
      return
    }
    
    if (!confirm(`Delete user ${email}?`)) return

    const supabase = createClient()
    const { error } = await supabase
      .from('ops_users')
      .delete()
      .eq('id', userId)

    if (error) {
      console.error('Error deleting user:', error)
    } else {
      fetchUsers()
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

  if (userRole !== 'admin') {
    return (
      <AuthRequired>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 py-8">
            <div className="bg-white rounded-xl p-8 text-center">
              <h1 className="text-xl font-semibold text-slate-800">Access Denied</h1>
              <p className="text-slate-600 mt-2">Admin access required</p>
            </div>
          </main>
        </div>
      </AuthRequired>
    )
  }

  return (
    <AuthRequired>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <Navbar />
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h1 className="text-3xl font-bold text-slate-800 mb-8">Admin Settings</h1>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* User Management */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-800 mb-4">User Management</h2>
              
              {/* Add User Form */}
              <form onSubmit={addUser} className="mb-6 p-4 bg-slate-50 rounded-lg">
                <h3 className="text-sm font-medium text-slate-700 mb-3">Add New User</h3>
                <div className="space-y-3">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@shefaschool.org"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Name (optional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-shefa-blue-500 focus:border-transparent"
                  >
                    {roleOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <div>
                    <label className="text-xs text-slate-600 mb-1 block">Teams</label>
                    <div className="flex flex-wrap gap-2">
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
                  <button
                    type="submit"
                    disabled={adding}
                    className="w-full bg-shefa-blue-600 hover:bg-shefa-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UserPlusIcon className="w-4 h-4" />
                    {adding ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </form>

              {/* User List */}
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {users.map((u) => (
                    <div
                      key={u.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        u.is_active ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-200 opacity-60'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-800 truncate">{u.email}</p>
                        <div className="flex items-center gap-2 mt-1">
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

            {/* Sync Management */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-6"
            >
              <h2 className="text-lg font-semibold text-slate-800 mb-4">Data Sync</h2>
              
              <div className="space-y-4">
                {/* BigQuery Sync */}
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h3 className="text-sm font-medium text-slate-700 mb-3">BigQuery Sources</h3>
                  <div className="space-y-2">
                    {['resources', 'group-events', 'resource-reservations'].map((source) => (
                      <div key={source} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600 capitalize">{source.replace('-', ' ')}</span>
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

                {/* Calendar Sync */}
                <div className="p-4 bg-slate-50 rounded-lg">
                  <h3 className="text-sm font-medium text-slate-700 mb-3">Google Calendars</h3>
                  <div className="space-y-2">
                    {['calendar-staff', 'calendar-ls', 'calendar-ms'].map((source) => (
                      <div key={source} className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">
                          {source === 'calendar-staff' ? 'Staff Calendar' :
                           source === 'calendar-ls' ? 'Lower School' :
                           'Middle School'}
                        </span>
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

                {/* Full Sync */}
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
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </AuthRequired>
  )
}
