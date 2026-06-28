'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { ModeBadge } from '@/components/ui'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'

interface NavItem {
  href: string
  label: string
  icon: string
  badge?: boolean
  muted?: boolean
}

interface NavGroup {
  label?: string
  showForModes?: WorkspaceMode[]
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: '🏠' },
      { href: '/inbox',     label: 'Inbox',     icon: '💬', badge: true },
    ],
  },
  {
    label: 'Business',
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/inbox/queue', label: 'AI Queue',    icon: '⚡' },
      { href: '/contacts',    label: 'Contacts',    icon: '👥' },
      { href: '/leads',       label: 'Leads',       icon: '🔥' },
      { href: '/analytics',   label: 'Analytics',   icon: '📊' },
      { href: '/automation',  label: 'Automation',  icon: '🤖' },
    ],
  },
  {
    label: 'Personal',
    showForModes: ['personal', 'hybrid'],
    items: [
      { href: '/relationships', label: 'Relationships', icon: '❤️' },
    ],
  },
  {
    items: [
      { href: '/proactive', label: 'Proactive',  icon: '✨' },
      { href: '/advisor',   label: 'AI Advisor', icon: '🧠' },
      { href: '/calendar',  label: 'Calendar',   icon: '📅' },
    ],
  },
]

const FOOTER_NAV: NavItem[] = [
  { href: '/notifications', label: 'Notifications', icon: '🔔' },
  { href: '/billing',       label: 'Billing',       icon: '💳' },
  { href: '/settings',      label: 'Settings',      icon: '⚙️' },
  { href: '/profile',       label: 'Profile',       icon: '👤' },
  { href: '/diagnostics',   label: 'Diagnostics',   icon: '🔧', muted: true },
]

const BOTTOM_NAV: Record<WorkspaceMode, NavItem[]> = {
  business: [
    { href: '/dashboard',   label: 'Home',     icon: '🏠' },
    { href: '/inbox',       label: 'Inbox',    icon: '💬', badge: true },
    { href: '/contacts',    label: 'Contacts', icon: '👥' },
    { href: '/inbox/queue', label: 'Queue',    icon: '⚡' },
  ],
  personal: [
    { href: '/dashboard',     label: 'Home',     icon: '🏠' },
    { href: '/inbox',         label: 'Inbox',    icon: '💬', badge: true },
    { href: '/relationships', label: 'People',   icon: '❤️' },
    { href: '/proactive',     label: 'Proactive',icon: '✨' },
  ],
  hybrid: [
    { href: '/dashboard',  label: 'Home',     icon: '🏠' },
    { href: '/inbox',      label: 'Inbox',    icon: '💬', badge: true },
    { href: '/contacts',   label: 'Contacts', icon: '👥' },
    { href: '/proactive',  label: 'Proactive',icon: '✨' },
  ],
}

function NavLink({
  item,
  pathname,
  onClick,
  compact = false,
}: {
  item: NavItem
  pathname: string
  onClick?: () => void
  compact?: boolean
}) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-indigo-600 text-white shadow-sm'
          : item.muted
          ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
          : 'text-gray-400 hover:text-white hover:bg-gray-800'
      } ${compact ? 'text-xs py-2' : ''}`}
    >
      <span className="text-base leading-none flex-shrink-0">{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function SidebarContents({
  pathname,
  email,
  mode,
  onNav,
  onSignOut,
}: {
  pathname: string
  email: string | undefined
  mode: WorkspaceMode
  onNav: () => void
  onSignOut: () => void
}) {
  const visibleGroups = NAV_GROUPS.filter(
    g => !g.showForModes || g.showForModes.includes(mode),
  )

  return (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">Z</span>
          </div>
          <span className="text-white font-semibold tracking-tight">Zuri</span>
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-4">
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-1">
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink key={item.href} item={item} pathname={pathname} onClick={onNav} />
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-gray-800 pt-3 space-y-0.5">
          {FOOTER_NAV.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} onClick={onNav} compact />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800 space-y-1 flex-shrink-0">
        <Link
          href="/onboarding"
          onClick={onNav}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-indigo-400 hover:text-indigo-300 hover:bg-gray-800 transition-colors"
        >
          <span className="text-base leading-none">📱</span>
          <span>Connect WhatsApp</span>
        </Link>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-white hover:bg-gray-800 transition-colors text-left"
        >
          <span className="text-base leading-none">→</span>
          Sign out
        </button>
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <ModeBadge mode={mode} />
          {email && <p className="text-xs text-gray-600 truncate min-w-0">{email}</p>}
        </div>
      </div>
    </>
  )
}

function MobileBottomNav({
  mode,
  pathname,
}: {
  mode: WorkspaceMode
  pathname: string
}) {
  const items = BOTTOM_NAV[mode]
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-gray-900 border-t border-gray-800 flex items-stretch safe-area-bottom">
      {items.map(item => {
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
              active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useZuriSession()
  const pathname = usePathname()
  const { signOut } = useClerk()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (session.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <span className="text-white text-sm font-bold">Z</span>
          </div>
          <div className="text-sm text-gray-500">Loading…</div>
        </div>
      </div>
    )
  }

  if (session.status === 'unauthenticated') return null

  const mode: WorkspaceMode = session.data?.mode ?? 'business'
  const handleSignOut = () => signOut({ redirectUrl: '/login' })
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-gray-900 flex items-center px-4 gap-3 border-b border-gray-800">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-400 hover:text-white p-2 -ml-2 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-[10px] font-bold">Z</span>
          </div>
          <span className="text-white font-semibold text-sm">Zuri</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/notifications"
            className="text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
            aria-label="Notifications"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          flex flex-col h-full w-64 bg-gray-900 flex-shrink-0
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        `}
      >
        <SidebarContents
          pathname={pathname}
          email={session.data?.user.email}
          mode={mode}
          onNav={closeSidebar}
          onSignOut={handleSignOut}
        />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50 pt-14 md:pt-0 pb-14 md:pb-0">
        {children}
      </main>

      {/* Mobile bottom nav */}
      <MobileBottomNav mode={mode} pathname={pathname} />
    </div>
  )
}
