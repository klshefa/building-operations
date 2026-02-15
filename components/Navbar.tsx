'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  HomeIcon,
  CalendarDaysIcon,
  ListBulletIcon,
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'

const navItems = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Calendar', href: '/calendar', icon: CalendarDaysIcon },
  { name: 'All Events', href: '/events', icon: ListBulletIcon },
  { name: 'My Tasks', href: '/my-tasks', icon: ClipboardDocumentCheckIcon },
  { name: 'Conflicts', href: '/conflicts', icon: ExclamationTriangleIcon },
  { name: 'Admin', href: '/admin', icon: Cog6ToothIcon },
]

export default function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">OP</span>
                </div>
                <span className="font-semibold text-slate-800 hidden sm:block">Building Ops</span>
              </Link>
            </div>

            <div className="hidden md:ml-8 md:flex md:space-x-1">
              {navItems.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon className="w-5 h-5 mr-1.5" />
                    {item.name}
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="md:hidden border-t border-slate-200">
        <div className="flex overflow-x-auto py-2 px-4 gap-1">
          {navItems.map((item) => {
            const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex-shrink-0 inline-flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <item.icon className="w-4 h-4 mr-1" />
                {item.name}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
