'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useWAStatus, type WAStatus } from '@/hooks/use-wa-status'
import { ModeBadge } from '@/components/ui'
import {
  LayoutDashboard, MessageSquare, Zap, Users, Flame, TrendingUp,
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
      { href: '/analytics',   label: 'Intelligence', icon: TrendingUp },
      { href: '/broadcasts',  label: 'Broadcasts',  icon: Radio },
    ],
  },
  {
    label: 'AI Workforce',
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/automation',     label: 'Agents & Rules',  icon: Bot },
      { href: '/knowledge-base', label: 'Knowledge Base',  icon: BookOpen },
      { href: '/escalations',    label: 'Escalations',     icon: AlertTriangle, badge: true },
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
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ease-out group ${
        active
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
          : item.muted
          ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
          : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50'
      } ${compact ? 'text-xs py-2' : ''}`}
    >
      <Icon className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

function WAStatusWidget({ wa, onNav }: { wa: WAStatus; onNav: () => void }) {
  if (wa.status === 'connected') {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-800/30 gap-2 border border-gray-800/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-400 leading-tight">Connected</p>
            {wa.phone && (
              <p className="text-[10px] text-gray-500 font-medium truncate leading-tight mt-0.5">+{wa.phone}</p>
            )}
          </div>
        </div>
        <Link
          href="/settings"
          onClick={onNav}
          className="text-[10px] font-bold text-gray-400 hover:text-gray-200 flex-shrink-0 transition-colors"
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
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-amber-950/20 border border-amber-900/30 hover:bg-amber-950/40 transition-colors"
      >
        <Loader2 className="w-4 h-4 text-amber-400 flex-shrink-0 animate-spin" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-amber-400 leading-tight">
            {wa.status === 'qr_pending' ? 'Scan QR code' : wa.status === 'link_code_pending' ? 'Enter link code' : 'Connecting…'}
          </p>
          <p className="text-[10px] text-amber-600/80 font-medium leading-tight mt-0.5">Tap to continue setup</p>
        </div>
      </Link>
    )
  }

  if (wa.status === 'error') {
    return (
      <Link
        href="/onboarding"
        onClick={onNav}
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-rose-950/20 border border-rose-900/30 hover:bg-rose-950/40 transition-colors"
      >
        <WifiOff className="w-4 h-4 text-rose-400 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-bold text-rose-400 leading-tight">Connection error</p>
          <p className="text-[10px] text-rose-600/80 font-medium leading-tight mt-0.5">Tap to reconnect</p>
        </div>
      </Link>
    )
  }

  if (wa.status === 'disconnected') {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <WifiOff className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
          <p className="text-xs font-medium text-gray-500 truncate">WhatsApp disconnected</p>
        </div>
        <Link
          href="/onboarding"
          onClick={onNav}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-gray-800/40 transition-colors"
        >
          <Smartphone className="w-4 h-4 flex-shrink-0" />
          <span>Reconnect WhatsApp</span>
        </Link>
      </div>
    )
  }

  return (
    <Link
      href="/onboarding"
      onClick={onNav}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-gray-800/40 transition-colors"
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
      <div className="h-16 flex items-center px-5 border-b border-gray-800/60 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-indigo-500/20">
            <span className="text-white text-sm font-black tracking-tight">Z</span>
          </div>
          <span className="text-white font-bold text-base tracking-tight">Zuri</span>
        </div>
      </div>

      {/* Scrollable nav */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-none">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.label && (
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-2">
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

        <div className="border-t border-gray-800/60 pt-4 space-y-0.5">
          {FOOTER_NAV.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} onClick={onNav} compact />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-800/60 space-y-2 flex-shrink-0 bg-gray-900/50 backdrop-blur-md">
        <WAStatusWidget wa={wa} onNav={onNav} />
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 transition-colors text-left"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          Sign out
        </button>
        <div className="px-3 py-1 flex items-center justify-between gap-2">
          <ModeBadge mode={mode} />
          {email && <p className="text-xs text-gray-600 font-medium truncate min-w-0">{email}</p>}
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
    <nav className="md:hidden fixed bottom-4 left-4 right-4 z-40 bg-gray-900/95 backdrop-blur-xl border border-gray-800/50 rounded-2xl flex items-stretch shadow-[0_8px_32px_rgba(0,0,0,0.4)] safe-area-bottom overflow-hidden">
      {items.map(item => {
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[60px] relative transition-all duration-300 ${
              active ? 'text-indigo-400 font-bold' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {active && (
              <span className="absolute top-0 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_2px_10px_rgba(99,102,241,0.5)]" />
            )}
            <Icon className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-105' : ''}`} />
            <span className="text-[10px] font-semibold tracking-wide leading-none">{item.label}</span>
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
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-b from-indigo-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/10 animate-bounce">
            <span className="text-white text-base font-black">Z</span>
          </div>
          <div className="text-xs font-bold tracking-widest uppercase text-gray-600 animate-pulse">Loading Zuri</div>
        </div>
      </div>
    )
  }

  if (session.status === 'unauthenticated') return null

  const mode: WorkspaceMode = session.data?.mode ?? 'business'
  const handleSignOut = () => signOut({ redirectUrl: '/login' })
  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950 antialiased selection:bg-indigo-500/30">
      
      {/* Floating Modern Mobile Menu Trigger (No solid double headers) */}
      <div className="md:hidden fixed top-3 left-3 z-40 pointer-events-none">
        <button
          onClick={() => setSidebarOpen(true)}
          className="pointer-events-auto flex items-center justify-center w-11 h-11 bg-gray-900/90 backdrop-blur-md border border-gray-800/60 text-gray-300 active:scale-95 rounded-xl shadow-lg transition-all"
          aria-label="Open navigation drawer"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Floating Modern Mobile Notifications trigger */}
      <div className="md:hidden fixed top-3 right-3 z-40 pointer-events-none">
        <Link
          href="/notifications"
          className="pointer-events-auto flex items-center justify-center w-11 h-11 bg-gray-900/90 backdrop-blur-md border border-gray-800/60 text-gray-300 active:scale-95 rounded-xl shadow-lg transition-all"
          aria-label="View notifications"
        >
          <Bell className="w-5 h-5" />
        </Link>
      </div>

      {/* Mobile backdrop with smooth modern blur */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Modern Sidebar Container */}
      <aside
        className={`
          fixed md:relative z-50 md:z-auto
          flex flex-col h-full w-66 bg-gray-900 flex-shrink-0
          transition-transform duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          border-r border-gray-800/40 shadow-2xl md:shadow-none
        `}
      >
        {sidebarOpen && (
          <button
            onClick={closeSidebar}
            className="md:hidden absolute top-4 right-4 text-gray-400 hover:text-gray-100 p-2 rounded-xl bg-gray-800/40 transition-colors"
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

      {/* Main Content Layout with bottom padding padding configuration for clean app viewports */}
      <main className="flex-1 overflow-auto bg-gray-50 pb-24 md:pb-0 transition-all duration-300">
        {children}
      </main>

      {/* Premium app bottom tab row */}
      <MobileBottomNav mode={mode} pathname={pathname} />
    </div>
  )
}
