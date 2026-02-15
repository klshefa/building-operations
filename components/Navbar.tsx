'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Dashboard' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/events', label: 'All Events' },
    { href: '/my-tasks', label: 'My Tasks' },
    { href: '/conflicts', label: 'Conflicts' },
    { href: '/admin', label: 'Admin' },
  ]

  return (
    <nav style={{ 
      backgroundColor: 'white', 
      borderBottom: '1px solid #e2e8f0',
      padding: '12px 24px',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '24px',
        maxWidth: '1280px',
        margin: '0 auto'
      }}>
        <Link href="/" style={{ 
          fontWeight: 'bold', 
          fontSize: '18px',
          color: '#1e40af',
          textDecoration: 'none'
        }}>
          Building Ops
        </Link>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          {links.map((link) => {
            const isActive = link.href === '/' 
              ? pathname === '/' 
              : pathname.startsWith(link.href)
            
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  backgroundColor: isActive ? '#eff6ff' : 'transparent',
                  color: isActive ? '#1d4ed8' : '#475569',
                }}
              >
                {link.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
