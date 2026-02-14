'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import { UserRole } from '@/lib/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  role: UserRole | null
  teams: string[]
  isAdmin: boolean
  hasAccess: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<UserRole | null>(null)
  const [teams, setTeams] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    checkUser()
    
    // Listen for auth changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        fetchUserRole(session.user.email)
      } else {
        resetAuth()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function resetAuth() {
    setRole(null)
    setTeams([])
    setIsAdmin(false)
    setHasAccess(false)
  }

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    
    if (session?.user?.email) {
      await fetchUserRole(session.user.email)
    }
    
    setLoading(false)
  }

  async function fetchUserRole(email: string) {
    const supabase = createClient()
    const emailLower = email.toLowerCase()
    
    try {
      // First check ops_users table
      const { data: opsUser, error: opsError } = await supabase
        .from('ops_users')
        .select('role, teams, is_active')
        .eq('email', emailLower)
        .eq('is_active', true)
        .maybeSingle()

      if (opsUser) {
        setRole(opsUser.role as UserRole)
        setTeams(opsUser.teams || [])
        setIsAdmin(opsUser.role === 'admin')
        setHasAccess(true)
        return
      }

      // Fallback: check super_admins table
      const { data: superAdmin } = await supabase
        .from('super_admins')
        .select('email')
        .eq('email', emailLower)
        .maybeSingle()

      if (superAdmin) {
        setRole('admin')
        setTeams([])
        setIsAdmin(true)
        setHasAccess(true)
        return
      }

      // No access
      resetAuth()
    } catch (err) {
      console.error('Error fetching user role:', err)
      resetAuth()
    }
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    resetAuth()
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, loading, role, teams, isAdmin, hasAccess, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
