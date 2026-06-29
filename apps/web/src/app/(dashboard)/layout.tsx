'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useWAStatus, type WAStatus } from '@/hooks/use-wa-status'
import { ModeBadge } from '@/components/ui'
import {
  LayoutDashboard, MessageSquare, Zap, Users, Flame, BarChart3,
  Settings2, Bot, BookOpen, AlertTriangle, Radio, HeartPulse,
  Sparkles, Brain, Calendar, Bell, CreditCard, Settings, User,
  Wrench, LogOut, Smartphone, Menu, X, UserCheck,
  WifiOff, Loader2,
} from 'lucide-react'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'

interface NavItem {
  href: string
  label: string
  icon: React.FC<{ className?: string }>
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
      { href: '/dashboard', label: 'Dashboard',   icon: LayoutDashboard },
      { href: '/inbox',     label: 'Inbox',        icon: MessageSquare,  badge: true },
    ],
  },
  {
    label: 'Business',
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/inbox/queue', label: 'AI Queue',    icon: Zap },
      { href: '/contacts',    label: 'Contacts',    icon: Users },
      { href: '/leads',       label: 'Leads',       icon: Flame },
      { href: '/analytics',   label: 'Analytics',   icon: BarChart3 },
      { href: '/automation',  label: 'Automation',  icon: Settings2 },
      { href: '/broadcasts',  label: 'Broadcasts',  icon: Radio },
    ],
  },
  {
    label: 'AI Agents',
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/agents',         label: 'Agents',        icon: Bot },
      { href: '/knowledge-base', label: 'Knowledge Base', icon: BookOpen },
      { href: '/escalations',    label: 'Escalations',   icon: AlertTriangle, badge: true },
    ],
  },
  {
    label: 'Team',
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/team', label: 'Team Inbox', icon: UserCheck },
    ],
  },
  {
    label: 'Personal',
    showForModes: ['personal', 'hybrid'],
    items: [
      { href: '/relationships', label: 'Relationships', icon: HeartPulse },
    ],
  },
  {
    items: [
      { href: '/proactive', label: 'Proactive',  icon: Sparkles },
      { href: '/advisor',   label: 'AI Advisor', icon: Brain },
      { href: '/calendar',  label: 'Calendar',   icon: Calendar },
    ],
  },
]

const FOOTER_NAV: NavItem[] = [
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/billing',       label: 'Billing',       icon: CreditCard },
  { href: '/settings',      label: 'Settings',      icon: Settings },
  { href: '/profile',       label: 'Profile',       icon: User },
  { href: '/diagnostics',   label: 'Diagnostics',   icon: Wrench, muted: true },
]

const BOTTOM_NAV: Record<WorkspaceMode, NavItem[]> = {
  business: [
    { href: '/dashboard',   label: 'Home',     icon: LayoutDashboard },
    { href: '/inbox',       label: 'Inbox',    icon: MessageSquare, badge: true },
    { href: '/contacts',    label: 'Contacts', icon: Users },
    { href: '/inbox/queue', label: 'Queue',    icon: Zap },
  ],
  personal: [
    { href: '/dashboard',     label: 'Home',      icon: LayoutDashboard },
    { href: '/inbox',         label: 'Inbox',     icon: MessageSquare, badge: true },
    { href: '/relationships', label: 'People',    icon: HeartPulse },
    { href: '/proactive',     label: 'Proactive', icon: Sparkles },
  ],
  hybrid: [
    { href: '/dashboard',  label: 'Home',      icon: LayoutDashboard },
    { href: '/inbox',      label: 'Inbox',     icon: MessageSquare, badge: true },
    { href: '/contacts',   label: 'Contacts',  icon: Users },
    { href: '/proactive',  label: 'Proactive', icon: Sparkles },
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
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
        active
          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/30'
          : item.muted
          ? 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/50'
          : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
      } ${compact ? 'text-xs py-2' : ''}`}
    >
      <Icon className={`flex-shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function WAStatusWidget({ wa, onNav }: { wa: WAStatus; onNav: () => void }) {
  if (wa.status === 'connected') {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-gray-800/40 gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.7)]" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-green-400 leading-tight">Connected</p>
            {wa.phone && (
              <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">+{wa.phone}</p>
            )}
          </div>
        </div>
        <Link
          href="/settings"
          onClick={onNav}
          className="text-[10px] text-gray-600 hover:text-gray-400 flex-shrink-0 transition-colors"
        >
          Manage
        </Link>
      </div>
    )
  }

  if (wa.status === 'connecting' || wa.status === 'qr_pending' || wa.status === 'link_code_pending') {
    return (
      <Link
        href="/onboarding"
        onClick={onNav}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-amber-900/20 hover:bg-amber-900/30 transition-colors"
      >
        <Loader2 className="w-4 h-4 text-amber-400 flex-shrink-0 animate-spin" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-amber-400 leading-tight">
            {wa.status === 'qr_pending' ? 'Scan QR code' : wa.status === 'link_code_pending' ? 'Enter link code' : 'Connecting…'}
          </p>
          <p className="text-[10px] text-gray-600 leading-tight mt-0.5">Tap to continue setup</p>
        </div>
      </Link>
    )
  }

  if (wa.status === 'error') {
    return (
      <Link
        href="/onboarding"
        onClick={onNav}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-red-900/20 hover:bg-red-900/30 transition-colors"
      >
        <WifiOff className="w-4 h-4 text-red-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium text-red-400 leading-tight">Connection error</p>
          <p className="text-[10px] text-gray-600 leading-tight mt-0.5">Tap to reconnect</p>
        </div>
      </Link>
    )
  }

  if (wa.status === 'disconnected') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <WifiOff className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
          <p className="text-xs text-gray-600 truncate">WhatsApp disconnected</p>
        </div>
        <Link
          href="/onboarding"
          onClick={onNav}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-indigo-400 hover:text-indigo-300 hover:bg-gray-800/60 transition-colors"
        >
          <Smartphone className="w-4 h-4 flex-shrink-0" />
          <span>Reconnect WhatsApp</span>
        </Link>
      </div>
    )
  }

  // unknown / never connected
  return (
    <Link
      href="/onboarding"
      onClick={onNav}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-indigo-400 hover:text-indigo-300 hover:bg-gray-800/60 transition-colors"
    >
      <Smartphone className="w-4 h-4 flex-shrink-0" />
      <span>Connect WhatsApp</span>
    </Link>
  )
}

function SidebarContents({
  pathname,
  email,
  mode,
  wa,
  onNav,
  onSignOut,
}: {
  pathname: string
  email: string | undefined
  mode: WorkspaceMode
  wa: WAStatus
  onNav: () => void
  onSignOut: () => void
}) {
  const visibleGroups = NAV_GROUPS.filter(
    g => !g.showForModes || g.showForModes.includes(mode),
  )

  return (
    <>
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-gray-800/80 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold tracking-tight">Z</span>
          </div>
          <span className="text-white font-semibold tracking-tight">Zuri</span>
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-5">
        {visibleGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && (
              <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest px-3 mb-1.5">
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

        <div className="border-t border-gray-800/80 pt-4 space-y-0.5">
          {FOOTER_NAV.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} onClick={onNav} compact />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-gray-800/80 space-y-1 flex-shrink-0">
        <WAStatusWidget wa={wa} onNav={onNav} />
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-600 hover:text-gray-300 hover:bg-gray-800/60 transition-colors text-left"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign out
        </button>
        <div className="px-3 py-2 flex items-center justify-between gap-2">
          <ModeBadge mode={mode} />
          {email && <p className="text-xs text-gray-700 truncate min-w-0">{email}</p>}
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
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px] transition-colors ${
              active ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            <Icon className="w-5 h-5" />
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
  const wa = useWAStatus(session.data?.accessToken)

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

  const waStatusDot =
    wa.status === 'connected'                                              ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]' :
    wa.status === 'connecting' || wa.status === 'qr_pending' || wa.status === 'link_code_pending' ? 'bg-amber-400 animate-pulse' :
    wa.status === 'error'                                                  ? 'bg-red-500' :
    wa.status === 'disconnected'                                           ? 'bg-gray-600' :
    'bg-transparent'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-gray-900 flex items-center px-4 gap-3 border-b border-gray-800">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-gray-500 hover:text-gray-200 p-2 -ml-2 rounded-lg transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="w-6 h-6 rounded-md bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">Z</span>
            </div>
            {wa.status !== 'unknown' && (
              <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-gray-900 ${waStatusDot}`} />
            )}
          </div>
          <span className="text-white font-semibold text-sm">Zuri</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/notifications"
            className="text-gray-500 hover:text-gray-200 p-2 rounded-lg transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
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
          border-r border-gray-800/60
        `}
      >
        {sidebarOpen && (
          <button
            onClick={closeSidebar}
            className="md:hidden absolute top-4 right-4 text-gray-500 hover:text-gray-200 p-1 rounded-lg"
            aria-label="Close menu"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <SidebarContents
          pathname={pathname}
          email={session.data?.user.email}
          mode={mode}
          wa={wa}
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
