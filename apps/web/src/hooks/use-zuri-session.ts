'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'

// Module-level cache keyed by Clerk userId so it survives re-renders
// but clears automatically when a different user signs in.
const _store: { userId: string; token: string; mode: WorkspaceMode; isAdmin: boolean } = {
  userId: '',
  token: '',
  mode: 'business',
  isAdmin: false,
}

// Subscribers get notified when mode changes via setStoredMode
type ModeSubscriber = (mode: WorkspaceMode) => void
const _modeSubscribers = new Set<ModeSubscriber>()

export function setStoredMode(mode: WorkspaceMode) {
  _store.mode = mode
  _modeSubscribers.forEach((fn) => fn(mode))
}

export function useZuriSession() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const [token, setToken] = useState<string | null>(
    user?.id && _store.userId === user.id ? _store.token : null,
  )
  const [mode, setMode] = useState<WorkspaceMode>(
    user?.id && _store.userId === user.id ? _store.mode : 'business',
  )
  const [isAdmin, setIsAdmin] = useState<boolean>(
    user?.id && _store.userId === user.id ? _store.isAdmin : false,
  )
  const [syncFailed, setSyncFailed] = useState(false)
  const pending = useRef(false)

  // Subscribe to external mode changes (e.g. from settings page)
  useEffect(() => {
    const sub: ModeSubscriber = (m) => setMode(m)
    _modeSubscribers.add(sub)
    return () => { _modeSubscribers.delete(sub) }
  }, [])

  useEffect(() => {
    if (!isSignedIn || !user) return
    if (_store.userId === user.id && _store.token) {
      setToken(_store.token)
      setMode(_store.mode)
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
          _store.isAdmin = data.user?.isAdmin ?? false
          setToken(data.token)
          setMode(_store.mode)
          setIsAdmin(_store.isAdmin)
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
      isAdmin,
      user: {
        id: user!.id,
        email: user!.emailAddresses[0]?.emailAddress ?? '',
        name: user!.fullName ?? '',
      },
    },
    status: 'authenticated' as const,
  }
}
