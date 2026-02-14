'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  loading: boolean
  teams: string[]
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
  const [teams, setTeams] = useState<string[]>([])
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    checkUser()
    
    // Listen for auth changes
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        fetchUserAccess(session.user.email)
      } else {
        resetAuth()
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  function resetAuth() {
    setTeams([])
    setHasAccess(false)
  }

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    
    if (session?.user?.email) {
      await fetchUserAccess(session.user.email)
    }
    
    setLoading(false)
  }

  async function fetchUserAccess(email: string) {
    const supabase = createClient()
    const emailLower = email.toLowerCase()
    
    try {
      // Check ops_users table for access and team assignments
      const { data: opsUser } = await supabase
        .from('ops_users')
        .select('teams, is_active')
        .eq('email', emailLower)
        .eq('is_active', true)
        .maybeSingle()

      if (opsUser) {
        setTeams(opsUser.teams || [])
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
        setTeams([])
        setHasAccess(true)
        return
      }

      // No access
      resetAuth()
    } catch (err) {
      console.error('Error fetching user access:', err)
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
    <AuthContext.Provider value={{ user, loading, teams, hasAccess, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
