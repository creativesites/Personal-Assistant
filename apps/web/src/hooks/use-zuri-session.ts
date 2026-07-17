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

// Subscribers get notified when mode changes via setStoredMode
type ModeSubscriber = (mode: WorkspaceMode) => void
const _modeSubscribers = new Set<ModeSubscriber>()

export function setStoredMode(mode: WorkspaceMode) {
  _store.mode = mode
  _modeSubscribers.forEach((fn) => fn(mode))
}

// Subscribers get notified when marketingAccess changes via setStoredMarketingAccess
type MarketingAccessSubscriber = (access: MarketingAccess) => void
const _marketingAccessSubscribers = new Set<MarketingAccessSubscriber>()

export function setStoredMarketingAccess(access: MarketingAccess) {
  _store.marketingAccess = access
  _marketingAccessSubscribers.forEach((fn) => fn(access))
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

  useEffect(() => {
    if (!isSignedIn || !user) return
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
