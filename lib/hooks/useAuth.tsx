'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { TeamType, UserRole } from '@/lib/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  hasAccess: boolean
  userRole: UserRole | null
  userTeams: TeamType[]
  signIn: () => Promise<void>
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
  const [hasAccess, setHasAccess] = useState(false)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [userTeams, setUserTeams] = useState<TeamType[]>([])

  useEffect(() => {
    checkUser()
    
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        // User has session, assume access (callback already validated)
        // Fetch role/teams in background
        fetchUserDetails(session.user.email)
        setHasAccess(true)
      } else {
        setHasAccess(false)
        setUserRole(null)
        setUserTeams([])
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    console.log('[useAuth] checkUser starting...')
    const supabase = createClient()
    const { data: { session }, error } = await supabase.auth.getSession()
    
    console.log('[useAuth] getSession result - user:', session?.user?.email, 'error:', error?.message)
    
    setUser(session?.user ?? null)
    
    if (session?.user?.email) {
      // User has session, assume access (callback already validated)
      setHasAccess(true)
      await fetchUserDetails(session.user.email)
    }
    
    setLoading(false)
    console.log('[useAuth] checkUser done - loading set to false')
  }

  async function fetchUserDetails(email: string) {
    try {
      const response = await fetch(`/api/auth/check-access?email=${encodeURIComponent(email.toLowerCase())}`)
      const data = await response.json()

      if (data.hasAccess) {
        setUserRole(data.role as UserRole)
        setUserTeams((data.teams || []) as TeamType[])
      }
    } catch (err) {
      console.error('Error fetching user details:', err)
    }
  }

  async function signIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: 'shefaschool.org'
        }
      }
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUser(null)
    setHasAccess(false)
    setUserRole(null)
    setUserTeams([])
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, loading, hasAccess, userRole, userTeams, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
