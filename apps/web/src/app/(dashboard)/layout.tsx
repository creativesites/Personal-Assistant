'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useClerk } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useWAStatus, type WAStatus } from '@/hooks/use-wa-status'
import { ModeBadge } from '@/components/ui'
import { CommandPalette } from '@/components/command-palette'
import { SubscriptionStatusBanner } from '@/components/subscription-status-banner'
import { useToast } from '@/components/ui/toast'
import { getSocket } from '@/lib/socket'
import {
  LayoutDashboard, MessageSquare, Zap, Users, Flame, TrendingUp,
  Bot, BookOpen, AlertTriangle, HeartPulse,
  Sparkles, Brain, Calendar, Bell, CreditCard, Settings, User,
  Wrench, LogOut, Smartphone, Menu, X, Search,
  WifiOff, Loader2, ChevronLeft, ChevronRight, ChevronDown, Send, FileText, Minimize2, FolderKanban, Target, History, Briefcase, Rss
} from 'lucide-react'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'
type MarketingAccess = 'none' | 'waitlisted' | 'beta' | 'enabled'

interface NavItem {
  href: string
  label: string
  icon: React.FC<{ className?: string }>
  badge?: boolean
  muted?: boolean
  // Item-level mode override — lets a hub contain a mix of always-visible
  // items (e.g. AI Advisor, Goals) and mode-restricted ones (e.g.
  // Relationships, AI Queue) without needing a whole separate group.
  showForModes?: WorkspaceMode[]
}

interface NavGroup {
  // Stable id for localStorage-persisted collapse state — must never change
  // once shipped, or every user's collapse preference for that hub resets.
  key: string
  label: string
  icon: React.FC<{ className?: string }>
  showForModes?: WorkspaceMode[]
  // Hidden unless marketingAccess is one of these — Studio's nav group is
  // gated on the entitlement, not on workspace mode. See ZURI_MARKETING_EXPANSION.md §12.
  requiresMarketingAccess?: MarketingAccess[]
  items: NavItem[]
}

// Nav IA — reorganised from ~25 flat items into 7 jobs-to-be-done hubs
// (Home/Conversations/CRM/AI/Personal/Marketing, plus the Settings hub in
// FOOTER_NAV below) rather than grouping by how the product was built.
// Broadcasts and Team Inbox are intentionally not listed anywhere below —
// the app isn't shipping with that functionality initially; the route
// files themselves are untouched, only the nav entries are removed.
const NAV_GROUPS: NavGroup[] = [
  {
    key: 'home',
    label: 'Home',
    icon: LayoutDashboard,
    items: [
      { href: '/dashboard',     label: 'Dashboard',     icon: LayoutDashboard },
      // { href: '/studio', label: ' Business Manager ', icon: Send },
      { href: '/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    key: 'marketing',
    label: 'Business',
    icon: Send,
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/studio', label: ' Business Manager ', icon: Send },
    ],
  },
  {
    key: 'conversations',
    label: 'Conversations',
    icon: MessageSquare,
    items: [
      { href: '/inbox',       label: 'Inbox',        icon: MessageSquare, badge: true },
      { href: '/inbox/queue', label: 'AI Queue',     icon: Zap,           showForModes: ['business', 'hybrid'] },
      { href: '/escalations', label: 'Escalations',  icon: AlertTriangle, badge: true, showForModes: ['business', 'hybrid'] },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    icon: Users,
    showForModes: ['business', 'hybrid'],
    items: [
      { href: '/contacts', label: 'Contacts',      icon: Users },
      { href: '/leads',    label: 'Leads',         icon: Flame },
      { href: '/projects', label: 'Projects',      icon: FolderKanban },
      { href: '/business', label: 'Documents',     icon: FileText },
      { href: '/feed',     label: 'Activity Feed', icon: Rss },
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    icon: Brain,
    items: [
      { href: '/advisor',        label: 'AI Advisor',  icon: Brain },
      { href: '/proactive',      label: 'Proactive',   icon: Sparkles },
      { href: '/automation',     label: 'Agents',      icon: Bot,        showForModes: ['business', 'hybrid'] },
      { href: '/knowledge-base', label: 'Knowledge',   icon: BookOpen,   showForModes: ['business', 'hybrid'] },
      { href: '/analytics',      label: 'Intelligence', icon: TrendingUp, showForModes: ['business', 'hybrid'] },
    ],
  },
  {
    key: 'personal',
    label: 'Personal',
    icon: HeartPulse,
    items: [
      { href: '/relationships', label: 'Relationships', icon: HeartPulse, showForModes: ['personal', 'hybrid'] },
      { href: '/goals',         label: 'Goals',         icon: Target },
      { href: '/career',        label: 'Career',        icon: Briefcase },
      { href: '/calendar',      label: 'Calendar',      icon: Calendar },
      { href: '/timeline',      label: 'Life Timeline', icon: History },
    ],
  },
  
]

// Settings hub — kept as the existing compact, pinned footer rather than a
// collapsible group, since it's always exactly 4 items and never mode-gated.
const FOOTER_NAV: NavItem[] = [
  { href: '/billing',     label: 'Billing',     icon: CreditCard },
  { href: '/settings',    label: 'Settings',    icon: Settings },
  { href: '/profile',     label: 'Profile',     icon: User },
  { href: '/diagnostics', label: 'Diagnostics', icon: Wrench, muted: true },
]

type BottomNavEntry = NavItem | { isMenuToggle: true } | { isSearchToggle: true }

const BOTTOM_NAV: Record<WorkspaceMode, BottomNavEntry[]> = {
  business: [
    { href: '/dashboard',   label: 'Home',     icon: LayoutDashboard },
    { href: '/inbox',       label: 'Inbox',    icon: MessageSquare, badge: true },
    { href: '/studio',    label: 'Business Manager', icon: Users },
    { isSearchToggle: true },
    { isMenuToggle: true },
  ],
  personal: [
    { href: '/dashboard',     label: 'Home',      icon: LayoutDashboard },
    { href: '/inbox',         label: 'Inbox',     icon: MessageSquare, badge: true },
    { href: '/relationships', label: 'People',    icon: HeartPulse },
    { isSearchToggle: true },
    { isMenuToggle: true },
  ],
  hybrid: [
    { href: '/dashboard',  label: 'Home',      icon: LayoutDashboard },
    { href: '/inbox',      label: 'Inbox',     icon: MessageSquare, badge: true },
    { href: '/studio',   label: 'Business Manager',  icon: Users },
    { isSearchToggle: true },
    { isMenuToggle: true },
  ],
}

function NavLink({
  item,
  pathname,
  onClick,
  onNavigate,
  compact = false,
  isMinimized = false,
  badgeValue,
}: {
  item: NavItem
  pathname: string
  onClick?: () => void
  onNavigate?: (href: string) => void
  compact?: boolean
  isMinimized?: boolean
  badgeValue?: number
}) {
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      onClick={() => {
        onNavigate?.(item.href)
        onClick?.()
      }}
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

      {!isMinimized && badgeValue !== undefined && badgeValue > 0 && (
        <span className="ml-auto rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-[10px] font-bold px-2 py-0.5 min-w-5 text-center leading-none">
          {badgeValue}
        </span>
      )}

      {isMinimized && badgeValue !== undefined && badgeValue > 0 && (
        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-indigo-500 border-2 border-gray-900 rounded-full animate-pulse" />
      )}

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

const NAV_COLLAPSE_STORAGE_KEY = 'zuri-nav-collapsed-groups'

function SidebarContents({
  pathname,
  email,
  mode,
  marketingAccess,
  wa,
  onNav,
  onNavStart,
  onSignOut,
  onOpenSearch,
  isMinimized = false,
  unreadNotificationsCount = 0,
}: {
  pathname: string
  email: string | undefined
  mode: WorkspaceMode
  marketingAccess: MarketingAccess
  wa: WAStatus
  onNav: () => void
  onNavStart: (href: string) => void
  onSignOut: () => void
  onOpenSearch: () => void
  isMinimized?: boolean
  unreadNotificationsCount?: number
}) {
  // Collapsible hub groups (mobile-space polish) — default all-expanded so
  // nothing appears to silently vanish on first load; a user's collapse
  // choice per hub persists across sessions via localStorage.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({})

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY)
      if (raw) setCollapsedGroups(JSON.parse(raw))
    } catch {
      // ignore malformed/unavailable storage — falls back to all-expanded
    }
  }, [])

  function toggleGroup(key: string) {
    setCollapsedGroups(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { window.localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, JSON.stringify(next)) } catch {
        // ignore — collapse state just won't persist this session
      }
      return next
    })
  }

  const visibleGroups = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(item => !item.showForModes || item.showForModes.includes(mode)) }))
    .filter(g =>
      g.items.length > 0 &&
      (!g.showForModes || g.showForModes.includes(mode)) &&
      (!g.requiresMarketingAccess || g.requiresMarketingAccess.includes(marketingAccess)),
    )

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

      <div className={`px-3 pt-3 flex-shrink-0 ${isMinimized ? 'flex justify-center' : ''}`}>
        <button
          onClick={onOpenSearch}
          title="Search"
          className={`flex items-center rounded-xl bg-gray-800/40 hover:bg-gray-800/70 text-gray-400 hover:text-gray-100 transition-colors ${
            isMinimized ? 'justify-center p-2.5 w-10 h-10' : 'w-full gap-2.5 px-3 py-2.5'
          }`}
        >
          <Search className="w-4 h-4 flex-shrink-0" />
          {!isMinimized && (
            <>
              <span className="text-sm font-medium flex-1 text-left">Search…</span>
              <span className="text-[10px] font-semibold text-gray-500 bg-gray-950/60 rounded-md px-1.5 py-0.5">⌘K</span>
            </>
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-none">
        {visibleGroups.map(group => {
          const collapsed = !isMinimized && collapsedGroups[group.key]
          const GroupIcon = group.icon
          return (
            <div key={group.key} className="space-y-1">
              {!isMinimized && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="w-full flex items-center justify-between px-3 mb-1 group/hdr"
                >
                  <span className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest group-hover/hdr:text-gray-300 transition-colors">
                    <GroupIcon className="w-3 h-3" />
                    {group.label}
                  </span>
                  <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform group-hover/hdr:text-gray-400 ${collapsed ? '-rotate-90' : ''}`} />
                </button>
              )}
              {!collapsed && (
                <div className="space-y-1">
                  {group.items.map(item => (
                    <NavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      onClick={onNav}
                      onNavigate={onNavStart}
                      isMinimized={isMinimized}
                      badgeValue={item.href === '/notifications' ? unreadNotificationsCount : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div className="border-t border-gray-800/60 pt-4 space-y-1">
          {FOOTER_NAV.map(item => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onClick={onNav}
              onNavigate={onNavStart}
              compact
              isMinimized={isMinimized}
              badgeValue={item.href === '/notifications' ? unreadNotificationsCount : undefined}
            />
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
  onOpenSearch,
  onNavStart,
  minimized,
  onMinimize,
  onRestore,
}: {
  mode: WorkspaceMode
  pathname: string
  onOpenMenu: () => void
  onOpenSearch: () => void
  onNavStart: (href: string) => void
  minimized: boolean
  onMinimize: () => void
  onRestore: () => void
}) {
  const items = BOTTOM_NAV[mode]

  const isSpecificTabActive = items.some(item => 'href' in item && (pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))))
  const isMenuTabActive = !isSpecificTabActive

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        className="fixed bottom-4 right-4 z-40 flex min-h-14 min-w-14 items-center justify-center rounded-full bg-slate-950 text-white shadow-2xl shadow-slate-950/30 ring-1 ring-white/10 transition-transform active:scale-95 md:hidden"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Show navigation"
      >
        <Menu className="h-5 w-5" />
      </button>
    )
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex w-full items-stretch border-t border-white/10 bg-slate-950/95 shadow-2xl shadow-slate-950/40 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
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

        if ('isSearchToggle' in item) {
          return (
            <button
              key="mobile-search-trigger"
              onClick={onOpenSearch}
              className="flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[60px] relative text-gray-500 hover:text-gray-300 active:scale-95 transition-all duration-200"
            >
              <Search className="w-5 h-5" />
              <span className="text-[10px] font-semibold tracking-wide leading-none">Search</span>
            </button>
          )
        }

        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => onNavStart(item.href)}
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
      <button
        type="button"
        onClick={onMinimize}
        className="flex min-w-12 flex-col items-center justify-center gap-1 py-2 text-gray-500 transition-colors hover:text-gray-300"
        aria-label="Minimize navigation"
      >
        <Minimize2 className="h-4 w-4" />
        <span className="text-[9px] font-semibold leading-none">Hide</span>
      </button>
    </nav>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = useZuriSession()
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useClerk()
  
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [mobileNavMinimized, setMobileNavMinimized] = useState(false)
  const [isNavigating, setIsNavigating] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const wa = useWAStatus(session.data?.accessToken)

  useEffect(() => {
    // Only redirect if session is authenticated, wa status has been loaded (not 'unknown'),
    // and they are not connected.
    if (session.status === 'authenticated' && wa.status !== 'unknown' && !wa.connected) {
      // Don't redirect if we are on pages where they might need to go (e.g., /onboarding, /profile, /settings, /billing, /diagnostics)
      const allowedPathsWithoutWA = [
        '/onboarding',
        '/profile',
        '/settings',
        '/billing',
        '/diagnostics',
      ]
      const isAllowed = allowedPathsWithoutWA.some(p => pathname === p || pathname.startsWith(p))
      if (!isAllowed) {
        router.push('/onboarding')
      }
    }
  }, [session.status, wa.status, wa.connected, pathname, router])

  useEffect(() => {
    setIsNavigating(false)
    setSidebarOpen(false)
  }, [pathname])

  if (session.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-white p-0 flex items-center justify-center shadow-lg animate-bounce">
            <img src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri%20(1).png" alt="Loading" className="w-full h-full object-contain" />
          </div>
          <div className="text-xs font-bold tracking-widest uppercase text-gray-600 animate-pulse">Loading Zuri</div>
        </div>
      </div>
    )
  }

  if (session.status === 'unauthenticated') return null

  const mode: WorkspaceMode = session.data?.mode ?? 'business'
  const marketingAccess: MarketingAccess = session.data?.marketingAccess ?? 'none'
  const handleSignOut = () => signOut({ redirectUrl: '/login' })
  const closeSidebar = () => setSidebarOpen(false)
  const startNavigation = (href: string) => {
    if (href !== pathname) setIsNavigating(true)
  }
  const handleDashboardClick = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const anchor = target.closest('a[href]')
    if (!(anchor instanceof HTMLAnchorElement)) return

    const href = anchor.getAttribute('href')
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
    if (anchor.target && anchor.target !== '_self') return

    try {
      const url = new URL(href, window.location.origin)
      if (url.origin === window.location.origin && url.pathname !== pathname) {
        setIsNavigating(true)
      }
    } catch {
      if (href.startsWith('/') && href !== pathname) setIsNavigating(true)
    }
  }

  return (
    <div className="flex flex-col md:flex-row h-screen w-screen overflow-hidden bg-gray-950 antialiased selection:bg-indigo-500/30">
      <div
        className={`fixed left-0 right-0 top-0 z-[70] h-0.5 origin-left bg-gradient-to-r from-cyan-400 via-indigo-400 to-fuchsia-400 transition-all duration-300 ${
          isNavigating ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
        }`}
      />
      {isNavigating && (
        <div className="pointer-events-none fixed left-1/2 top-3 z-[70] -translate-x-1/2 rounded-full bg-slate-950/90 px-3 py-1.5 text-[11px] font-bold text-white shadow-xl shadow-slate-950/30 ring-1 ring-white/10 backdrop-blur-md md:top-4">
          Loading
        </div>
      )}
      
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
          marketingAccess={marketingAccess}
          wa={wa}
          onNav={closeSidebar}
          onNavStart={startNavigation}
          onSignOut={handleSignOut}
          onOpenSearch={() => setSearchOpen(true)}
          isMinimized={isMinimized}
        />
      </aside>

      <main
        onClickCapture={handleDashboardClick}
        className={`flex-1 min-w-0 min-h-0 overflow-auto bg-gray-50 transition-all duration-300 ${
          mobileNavMinimized ? 'pb-20 md:pb-0' : 'pb-[calc(72px+env(safe-area-inset-bottom))] md:pb-0'
        }`}
      >
        <SubscriptionStatusBanner token={session.data?.accessToken} />
        {children}
      </main>

      {/* Premium mobile app bottom menu */}
      <MobileBottomNav
        mode={mode}
        pathname={pathname}
        onOpenMenu={() => setSidebarOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onNavStart={startNavigation}
        minimized={mobileNavMinimized}
        onMinimize={() => setMobileNavMinimized(true)}
        onRestore={() => setMobileNavMinimized(false)}
      />

      {/* Cmd+K command palette (docs/RELATIONSHIP_OS_PLAN.md §11) — also
          openable via the visible Search buttons in the sidebar and mobile
          bottom tab bar above, since Cmd+K alone had no discoverable trigger. */}
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  )
}
