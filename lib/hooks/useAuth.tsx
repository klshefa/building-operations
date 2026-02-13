'use client'

import { useEffect, useState, createContext, useContext } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

interface AuthContextType {
  user: User | null
  loading: boolean
  hasAccess: boolean
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

  useEffect(() => {
    checkUser()
    
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user?.email) {
        checkAccess(session.user.email)
      } else {
        setHasAccess(false)
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
      // Check if user has access to building operations
      const { data, error } = await supabase
        .from('ops_users')
        .select('email')
        .eq('email', email)
        .eq('is_active', true)
        .single()

      if (error || !data) {
        console.log('User not authorized for building operations:', email)
        setHasAccess(false)
      } else {
        setHasAccess(true)
      }
    } catch (err) {
      console.error('Error checking access:', err)
      setHasAccess(false)
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
    window.location.href = '/'
  }

  return (
    <AuthContext.Provider value={{ user, loading, hasAccess, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
