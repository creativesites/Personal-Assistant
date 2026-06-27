'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'

const NAV_ITEMS = [
  { href: '/inbox', label: 'Inbox', icon: '💬' },
  { href: '/relationships', label: 'Relationships', icon: '👥' },
  { href: '/proactive', label: 'Proactive', icon: '✨' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
] as const

function SidebarContents({
  pathname,
  email,
  onNav,
  onSignOut,
}: {
  pathname: string
  email: string | undefined
  onNav: () => void
  onSignOut: () => void
}) {
  return (
    <>
      <div className="h-14 flex items-center px-5 border-b border-gray-800 shrink-0">
        <span className="text-white font-semibold tracking-tight text-lg">Zuri</span>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-gray-800 space-y-1 shrink-0">
        <Link
          href="/onboarding"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-indigo-400 hover:text-indigo-300 hover:bg-gray-800 transition-colors"
        >
          <span className="text-base leading-none">📱</span>
          Connect WhatsApp
        </Link>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition-colors text-left"
        >
          <span className="text-base leading-none">→</span>
          Sign out
        </button>
        {email && (
          <p className="px-3 py-1 text-xs text-gray-600 truncate">{email}</p>
        )}
      </div>
    </>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useZuriSession()
  const pathname = usePathname()
  const { signOut } = useClerk()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (session.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-400">Loading...</div>
      </div>
    )
  }

  if (session.status === 'unauthenticated') return null

  const handleSignOut = () => signOut({ redirectUrl: '/login' })
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-gray-900 flex items-center px-4 gap-3 border-b border-gray-800">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-400 hover:text-white p-1 -ml-1 rounded"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-white font-semibold">Zuri</span>
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          flex flex-col h-full w-56 bg-gray-900 shrink-0
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        <SidebarContents
          pathname={pathname}
          email={session.data?.user.email}
          onNav={closeSidebar}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
