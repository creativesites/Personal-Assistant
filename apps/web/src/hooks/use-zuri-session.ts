'use client'

import { useAuth, useUser } from '@clerk/nextjs'
import { useEffect, useRef, useState } from 'react'

// Module-level cache keyed by Clerk userId so it survives re-renders
// but clears automatically when a different user signs in.
const _store: { userId: string; token: string } = { userId: '', token: '' }

export function useZuriSession() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user, isLoaded: userLoaded } = useUser()
  const [token, setToken] = useState<string | null>(
    user?.id && _store.userId === user.id ? _store.token : null,
  )
  const [syncFailed, setSyncFailed] = useState(false)
  const pending = useRef(false)

  useEffect(() => {
    if (!isSignedIn || !user) return
    if (_store.userId === user.id && _store.token) {
      setToken(_store.token)
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
          setToken(data.token)
        } else {
          // Backend unavailable — mark as failed so UI renders in degraded mode
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
      user: {
        id: user!.id,
        email: user!.emailAddresses[0]?.emailAddress ?? '',
        name: user!.fullName ?? '',
      },
    },
    status: 'authenticated' as const,
  }
}
