'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { UserRole, TeamType } from '@/lib/types'

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
        checkAccess(session.user.email)
      } else {
        setHasAccess(false)
        setUserRole(null)
        setUserTeams([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function checkUser() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    
    if (session?.user?.email) {
      await checkAccess(session.user.email)
    }
    
    setLoading(false)
  }

  async function checkAccess(email: string) {
    const supabase = createClient()
    
    try {
      const { data, error } = await supabase
        .from('ops_users')
        .select('email, role, teams')
        .eq('email', email)
        .eq('is_active', true)
        .single()

      if (error || !data) {
        console.log('User not authorized for building operations:', email)
        setHasAccess(false)
        setUserRole(null)
        setUserTeams([])
      } else {
        setHasAccess(true)
        setUserRole(data.role as UserRole)
        setUserTeams(data.teams as TeamType[] || [])
      }
    } catch (err) {
      console.error('Error checking access:', err)
      setHasAccess(false)
      setUserRole(null)
      setUserTeams([])
    }
  }

  async function signIn() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          hd: 'shefaschool.org',
          prompt: 'select_account',
        },
      },
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut({ scope: 'global' })
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
