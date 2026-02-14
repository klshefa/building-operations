'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import {
  HomeIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Calendar', href: '/calendar', icon: CalendarDaysIcon },
  { name: 'All Events', href: '/events', icon: ListBulletIcon },
  { name: 'My Tasks', href: '/my-tasks', icon: ClipboardDocumentCheckIcon },
  { name: 'Conflicts', href: '/conflicts', icon: ExclamationTriangleIcon },
]

export default function Navbar() {
  const pathname = usePathname()
  const { user, role, isAdmin, signOut } = useAuth()

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            {/* Logo */}
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-shefa-blue-600 to-shefa-blue-800 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">OP</span>
                </div>
                <span className="font-semibold text-slate-800 hidden sm:block">Building Ops</span>
              </Link>
            </div>

            {/* Navigation Links */}
            <div className="hidden md:ml-8 md:flex md:space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-shefa-blue-50 text-shefa-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon className="w-5 h-5 mr-1.5" />
                    {item.name}
                  </Link>
                )
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    pathname.startsWith('/admin')
                      ? 'bg-shefa-blue-50 text-shefa-blue-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Cog6ToothIcon className="w-5 h-5 mr-1.5" />
                  Admin
                </Link>
              )}
            </div>
          </div>

          {/* User Menu */}
          <div className="flex items-center gap-3">
            {user && (
              <>
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-medium text-slate-700">
                    {user.email?.split('@')[0]}
                  </span>
                  <span className="text-xs text-slate-500 capitalize">
                    {role?.replace('_', ' ') || 'User'}
                  </span>
                </div>
                <button
                  onClick={signOut}
                  className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <ArrowRightOnRectangleIcon className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden border-t border-slate-200">
        <div className="flex overflow-x-auto py-2 px-4 gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex-shrink-0 inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-shefa-blue-50 text-shefa-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <item.icon className="w-4 h-4 mr-1" />
                {item.name}
              </Link>
            )
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={`flex-shrink-0 inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname.startsWith('/admin')
                  ? 'bg-shefa-blue-50 text-shefa-blue-700'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Cog6ToothIcon className="w-4 h-4 mr-1" />
              Admin
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
