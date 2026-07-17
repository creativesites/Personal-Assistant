'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'
type MarketingAccess = 'none' | 'waitlisted' | 'beta' | 'enabled'
// Membership Platform Phase 6 — the Entitlement Engine's effective plan
// family, read off the session so FeatureGate can gate client-side without
// its own round-trip. Mirrors services/api/src/lib/entitlements.ts's
// PlanFamily type.
export type PlanFamily = 'free' | 'personal' | 'professional' | 'business' | 'enterprise'

// Module-level cache keyed by Clerk userId so it survives re-renders
// but clears automatically when a different user signs in.
const _store: {
  userId: string
  token: string
  mode: WorkspaceMode
  marketingAccess: MarketingAccess
  isAdmin: boolean
  planFamily: PlanFamily
} = {
  userId: '',
  token: '',
  mode: 'hybrid',
  marketingAccess: 'none',
  isAdmin: false,
  planFamily: 'free',
}

// A subscription/plan change (checkout approved, admin adjustment, a
// referral/promo credit) happens server-side and asynchronously — there is
// no client-side action to hang a "refetch now" off. Before this, planFamily
// (and isAdmin) were only ever set once per browser session, on the very
// first clerk-sync call; every FeatureGate mounted afterwards kept reading
// that stale snapshot from the module-level _store until a hard reload
// re-ran this module from scratch. mode/marketingAccess already had a
// pub/sub path for an explicit same-tab update (Settings' toggle); nothing
// covered the "it changed on the server while I was looking at this page"
// case at all. `_snapshotSubscribers` now covers all four fields, and a
// single module-level poll/visibility watcher keeps `_store` itself fresh
// so every mounted useZuriSession() instance self-heals without needing to
// know why the value changed.
type SessionSnapshot = {
  mode: WorkspaceMode
  marketingAccess: MarketingAccess
  isAdmin: boolean
  planFamily: PlanFamily
}
type SnapshotSubscriber = (snapshot: SessionSnapshot) => void
const _snapshotSubscribers = new Set<SnapshotSubscriber>()

function snapshotFromStore(): SessionSnapshot {
  return { mode: _store.mode, marketingAccess: _store.marketingAccess, isAdmin: _store.isAdmin, planFamily: _store.planFamily }
}

function notifySnapshotSubscribers() {
  const snapshot = snapshotFromStore()
  _snapshotSubscribers.forEach((fn) => fn(snapshot))
}

// Subscribers get notified when mode changes via setStoredMode
type ModeSubscriber = (mode: WorkspaceMode) => void
const _modeSubscribers = new Set<ModeSubscriber>()

export function setStoredMode(mode: WorkspaceMode) {
  _store.mode = mode
  _modeSubscribers.forEach((fn) => fn(mode))
  notifySnapshotSubscribers()
}

// Subscribers get notified when marketingAccess changes via setStoredMarketingAccess
type MarketingAccessSubscriber = (access: MarketingAccess) => void
const _marketingAccessSubscribers = new Set<MarketingAccessSubscriber>()

export function setStoredMarketingAccess(access: MarketingAccess) {
  _store.marketingAccess = access
  _marketingAccessSubscribers.forEach((fn) => fn(access))
  notifySnapshotSubscribers()
}

const RESYNC_INTERVAL_MS = 60_000 // entitlements change rarely; cheap enough to poll gently
let _resyncTimer: ReturnType<typeof setInterval> | null = null
let _resyncPending = false
let _watchersInitialised = false

async function resyncFromServer(): Promise<void> {
  if (!_store.userId || _resyncPending) return
  _resyncPending = true
  try {
    const res = await fetch('/api/auth/clerk-sync', { method: 'POST' })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (!data?.token || data.user?.id !== _store.userId) return
    _store.token = data.token
    _store.mode = (data.user?.mode as WorkspaceMode) ?? _store.mode
    _store.marketingAccess = (data.user?.marketingAccess as MarketingAccess) ?? _store.marketingAccess
    _store.isAdmin = data.user?.isAdmin ?? _store.isAdmin
    _store.planFamily = (data.user?.planFamily as PlanFamily) ?? _store.planFamily
    notifySnapshotSubscribers()
  } catch {
    // best-effort — the next interval tick or visibility change tries again
  } finally {
    _resyncPending = false
  }
}

// Explicit refresh for a caller that knows an entitlement-affecting action
// just happened (e.g. right after a guided-payment confirmation) — most of
// the value is still the background watchers below, since the actual grant
// usually lands later via an out-of-band admin approval.
export function refreshZuriSession(): Promise<void> {
  return resyncFromServer()
}

function ensureWatchers() {
  if (_watchersInitialised || typeof window === 'undefined') return
  _watchersInitialised = true

  _resyncTimer = setInterval(() => {
    if (document.visibilityState === 'visible') resyncFromServer()
  }, RESYNC_INTERVAL_MS)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resyncFromServer()
  })
}

export function useZuriSession() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const [token, setToken] = useState<string | null>(
    user?.id && _store.userId === user.id ? _store.token : null,
  )
  const [mode, setMode] = useState<WorkspaceMode>(
    user?.id && _store.userId === user.id ? _store.mode : 'hybrid',
  )
  const [marketingAccess, setMarketingAccess] = useState<MarketingAccess>(
    user?.id && _store.userId === user.id ? _store.marketingAccess : 'none',
  )
  const [isAdmin, setIsAdmin] = useState<boolean>(
    user?.id && _store.userId === user.id ? _store.isAdmin : false,
  )
  const [planFamily, setPlanFamily] = useState<PlanFamily>(
    user?.id && _store.userId === user.id ? _store.planFamily : 'free',
  )
  const [syncFailed, setSyncFailed] = useState(false)
  const pending = useRef(false)

  // Subscribe to external mode changes (e.g. from settings page)
  useEffect(() => {
    const sub: ModeSubscriber = (m) => setMode(m)
    _modeSubscribers.add(sub)
    return () => { _modeSubscribers.delete(sub) }
  }, [])

  // Subscribe to external marketingAccess changes (e.g. from the waitlist button)
  useEffect(() => {
    const sub: MarketingAccessSubscriber = (a) => setMarketingAccess(a)
    _marketingAccessSubscribers.add(sub)
    return () => { _marketingAccessSubscribers.delete(sub) }
  }, [])

  // Subscribe to the shared snapshot (mode/marketingAccess/isAdmin/planFamily)
  // so a background resync — this tab regaining focus, the periodic
  // interval, or another mounted instance's own initial fetch — updates
  // this instance too, without a page reload.
  useEffect(() => {
    const sub: SnapshotSubscriber = (snap) => {
      setMode(snap.mode)
      setMarketingAccess(snap.marketingAccess)
      setIsAdmin(snap.isAdmin)
      setPlanFamily(snap.planFamily)
    }
    _snapshotSubscribers.add(sub)
    return () => { _snapshotSubscribers.delete(sub) }
  }, [])

  useEffect(() => {
    if (!isSignedIn || !user) return
    ensureWatchers()
    if (_store.userId === user.id && _store.token) {
      setToken(_store.token)
      setMode(_store.mode)
      setMarketingAccess(_store.marketingAccess)
      setPlanFamily(_store.planFamily)
      return
    }
    if (pending.current) return

    pending.current = true
    setSyncFailed(false)

    fetch('/api/auth/clerk-sync', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.token) {
          _store.userId = user.id
          _store.token = data.token
          _store.mode = (data.user?.mode as WorkspaceMode) ?? 'business'
          _store.marketingAccess = (data.user?.marketingAccess as MarketingAccess) ?? 'none'
          _store.isAdmin = data.user?.isAdmin ?? false
          _store.planFamily = (data.user?.planFamily as PlanFamily) ?? 'free'
          setToken(data.token)
          setMode(_store.mode)
          setMarketingAccess(_store.marketingAccess)
          setIsAdmin(_store.isAdmin)
          setPlanFamily(_store.planFamily)
        } else {
          setSyncFailed(true)
        }
      })
      .catch(() => {
        setSyncFailed(true)
      })
      .finally(() => {
        pending.current = false
      })
  }, [isSignedIn, user])

  const isLoaded = authLoaded && userLoaded

  if (!isLoaded) return { data: null, status: 'loading' as const }
  if (!isSignedIn) return { data: null, status: 'unauthenticated' as const }

  // Clerk confirms user is signed in — return authenticated immediately.
  // accessToken is null when backend sync is still in progress or unavailable.
  // Pages that need the token should check session.accessToken before calling the API.
  return {
    data: {
      accessToken: token,
      syncFailed,
      mode,
      marketingAccess,
      isAdmin,
      planFamily,
      user: {
        id: user!.id,
        email: user!.emailAddresses[0]?.emailAddress ?? '',
        name: user!.fullName ?? '',
      },
    },
    status: 'authenticated' as const,
  }
}
