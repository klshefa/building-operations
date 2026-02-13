'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { motion } from 'framer-motion'

export default function AuthRequired({ children }: { children: React.ReactNode }) {
  const { user, loading, hasAccess, signIn } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-shefa-blue-200 border-t-shefa-blue-600 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-shefa-blue-600 to-shefa-blue-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-white font-bold text-2xl">OP</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Building Operations</h1>
          <p className="text-slate-600 mb-6">
            Sign in with your Shefa account to manage building operations and events.
          </p>
          <button
            onClick={signIn}
            className="w-full bg-shefa-blue-600 hover:bg-shefa-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>
        </motion.div>
      </div>
    )
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Access Denied</h1>
          <p className="text-slate-600 mb-4">
            You don&apos;t have permission to access the Building Operations portal.
          </p>
          <p className="text-sm text-slate-500 mb-6">
            Signed in as: <span className="font-medium">{user.email}</span>
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = 'https://sharks.shefaschool.org'}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 px-6 rounded-xl transition-colors"
            >
              Go to Sharks Portal
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return <>{children}</>
}
