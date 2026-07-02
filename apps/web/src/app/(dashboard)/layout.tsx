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
  WifiOff, Loader2, ChevronLeft, ChevronRight
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

const BOTTOM_NAV: Record<WorkspaceMode, (NavItem | { isMenuToggle: true })[]> = {
  business: [
    { href: '/dashboard',   label: 'Home',     icon: LayoutDashboard },
    { href: '/inbox',       label: 'Inbox',    icon: MessageSquare, badge: true },
    { href: '/contacts',    label: 'Contacts', icon: Users },
    { isMenuToggle: true },
  ],
  personal: [
    { href: '/dashboard',     label: 'Home',      icon: LayoutDashboard },
    { href: '/inbox',         label: 'Inbox',     icon: MessageSquare, badge: true },
    { href: '/relationships', label: 'People',    icon: HeartPulse },
    { isMenuToggle: true },
  ],
  hybrid: [
    { href: '/dashboard',  label: 'Home',      icon: LayoutDashboard },
    { href: '/inbox',      label: 'Inbox',     icon: MessageSquare, badge: true },
    { href: '/contacts',   label: 'Contacts',  icon: Users },
    { isMenuToggle: true },
  ],
}

function NavLink({
  item,
  pathname,
  onClick,
  compact = false,
  isMinimized = false,
}: {
  item: NavItem
  pathname: string
  onClick?: () => void
  compact?: boolean
  isMinimized?: boolean
}) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={onClick}
      title={isMinimized ? item.label : undefined}
      className={`flex items-center rounded-xl font-semibold transition-all duration-200 ease-out group relative ${
        isMinimized ? 'justify-center p-2.5 mx-auto w-10 h-10' : 'gap-3 px-3 py-2.5'
      } ${
        active
          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
          : item.muted
          ? 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
          : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50'
      } ${compact ? 'text-xs py-2' : 'text-sm'}`}
    >
      <Icon className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-105 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
      
      {!isMinimized && <span className="truncate">{item.label}</span>}

      {isMinimized && (
        <div className="absolute left-14 invisible group-hover:visible bg-gray-950 text-white text-xs px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl border border-gray-800/80 pointer-events-none z-50 transform translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150">
          {item.label}
        </div>
      )}
    </Link>
  )
}

function WAStatusWidget({ wa, onNav, isMinimized = false }: { wa: WAStatus; onNav: () => void; isMinimized?: boolean }) {
  if (wa.status === 'connected') {
    return (
      <div className={`flex items-center justify-between rounded-xl bg-gray-800/30 border border-gray-800/40 ${isMinimized ? 'p-2 justify-center' : 'px-3 py-2.5 gap-2'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          {!isMinimized && (
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-400 leading-tight">Connected</p>
              {wa.phone && <p className="text-[10px] text-gray-500 font-medium truncate leading-tight mt-0.5">+{wa.phone}</p>}
            </div>
          )}
        </div>
        {!isMinimized && (
          <Link href="/settings" onClick={onNav} className="text-[10px] font-bold text-gray-400 hover:text-gray-200 flex-shrink-0 transition-colors">
            Manage
          </Link>
        )}
      </div>
    )
  }

  return (
    <Link
      href="/onboarding"
      onClick={onNav}
      className={`flex items-center rounded-xl bg-gray-800/20 hover:bg-gray-800/40 transition-colors ${isMinimized ? 'p-2 justify-center w-10 h-10 mx-auto' : 'gap-2.5 px-3 py-2.5'}`}
    >
      <Smartphone className={`flex-shrink-0 ${wa.status === 'error' ? 'text-rose-400' : wa.status === 'disconnected' ? 'text-gray-500' : 'text-amber-400 animate-pulse'}`} size={16} />
      {!isMinimized && <span className="text-xs font-semibold text-gray-400 truncate">Connect WhatsApp</span>}
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
  isMinimized = false,
}: {
  pathname: string
  email: string | undefined
  mode: WorkspaceMode
  wa: WAStatus
  onNav: () => void
  onSignOut: () => void
  isMinimized?: boolean
}) {
  const visibleGroups = NAV_GROUPS.filter(g => !g.showForModes || g.showForModes.includes(mode))

  return (
    <>
      <div className={`h-16 flex items-center border-b border-gray-800/60 flex-shrink-0 ${isMinimized ? 'justify-center px-2' : 'px-5'}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white p-0 flex items-center justify-center flex-shrink-0 overflow-hidden border border-gray-700/30">
            <img 
              src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri%20(1).png" 
              alt="Zuri Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          {!isMinimized && <span className="text-white font-bold text-base tracking-tight bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">Zuri</span>}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-5 scrollbar-none">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className="space-y-1">
            {group.label && !isMinimized && (
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3 mb-2">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map(item => (
                <NavLink key={item.href} item={item} pathname={pathname} onClick={onNav} isMinimized={isMinimized} />
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-gray-800/60 pt-4 space-y-1">
          {FOOTER_NAV.map(item => (
            <NavLink key={item.href} item={item} pathname={pathname} onClick={onNav} compact isMinimized={isMinimized} />
          ))}
        </div>
      </nav>

      <div className="p-3 border-t border-gray-800/60 space-y-2 flex-shrink-0 bg-gray-900/50 backdrop-blur-md">
        <WAStatusWidget wa={wa} onNav={onNav} isMinimized={isMinimized} />
        <button
          onClick={onSignOut}
          title={isMinimized ? "Sign Out" : undefined}
          className={`w-full flex items-center rounded-xl text-sm font-semibold text-gray-500 hover:text-gray-300 hover:bg-gray-800/40 transition-colors text-left ${isMinimized ? 'p-2.5 justify-center w-10 h-10 mx-auto' : 'gap-3 px-3 py-2.5'}`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!isMinimized && <span>Sign out</span>}
        </button>
        {!isMinimized && (
          <div className="px-3 py-1 flex items-center justify-between gap-2">
            <ModeBadge mode={mode} />
            {email && <p className="text-xs text-gray-600 font-medium truncate min-w-0">{email}</p>}
          </div>
        )}
      </div>
    </>
  )
}

function MobileBottomNav({
  mode,
  pathname,
  onOpenMenu,
}: {
  mode: WorkspaceMode
  pathname: string
  onOpenMenu: () => void
}) {
  const items = BOTTOM_NAV[mode]

  const isSpecificTabActive = items.some(item => 'href' in item && (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))))
  const isMenuTabActive = !isSpecificTabActive

  return (
    <nav className="md:hidden fixed bottom-4 left-4 right-4 z-40 bg-gray-900/95 backdrop-blur-xl border border-gray-800/50 rounded-2xl flex items-stretch shadow-[0_8px_32px_rgba(0,0,0,0.4)] safe-area-bottom overflow-hidden">
      {items.map((item, index) => {
        if ('isMenuToggle' in item) {
          return (
            <button
              key="mobile-menu-trigger"
              onClick={onOpenMenu}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[60px] relative active:scale-95 transition-all duration-200 ${
                isMenuTabActive ? 'text-indigo-400 font-bold' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {isMenuTabActive && (
                <span className="absolute top-0 w-8 h-0.5 bg-indigo-500 rounded-full shadow-[0_2px_10px_rgba(99,102,241,0.5)]" />
              )}
              <Menu className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-wide leading-none">Menu</span>
            </button>
          )
        }

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
  const [isMinimized, setIsMinimized] = useState(false)
  const wa = useWAStatus(session.data?.accessToken)

  if (session.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white p-0 flex items-center justify-center shadow-lg animate-bounce">
            <img src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri.png" alt="Loading" className="w-full h-full object-contain" />
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
    <div className="flex h-screen w-screen overflow-hidden bg-gray-950 antialiased selection:bg-indigo-500/30">
      
      {/* Mobile background backdrop overlay */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
          onClick={closeSidebar}
        />
      )}

      {/* Fixed: Explicit positional boundaries for mobile absolute tracking vs desktop relative flexibility */}
      <aside
        className={`
          fixed top-0 bottom-0 left-0 z-50 md:z-auto md:relative
          flex flex-col h-full bg-gray-900
          transition-all duration-300 ease-in-out
          ${sidebarOpen ? 'translate-x-0 w-64' : '-translate-x-full md:translate-x-0'} 
          ${isMinimized ? 'md:w-16' : 'md:w-64'}
          border-r border-gray-800/40 shadow-2xl md:shadow-none
        `}
      >
        {/* Toggle Minimize Floating Button (Desktop-only) */}
        <button
          onClick={() => setIsMinimized(prev => !prev)}
          className="hidden md:flex absolute top-5 -right-3 w-6 h-6 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-full items-center justify-center shadow-md z-50 transition-colors"
          title={isMinimized ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isMinimized ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

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
          isMinimized={isMinimized}
        />
      </aside>

      {/* Main Content Viewport now correctly consumes 100% full width on mobile devices */}
      <main className="flex-1 w-full min-w-0 overflow-auto bg-gray-50 pb-24 md:pb-0 transition-all duration-300">
        {children}
      </main>

      {/* Premium mobile app bottom menu */}
      <MobileBottomNav mode={mode} pathname={pathname} onOpenMenu={() => setSidebarOpen(true)} />
    </div>
  )
}
