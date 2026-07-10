'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

type SetupState = 'loading' | 'ready' | 'claiming' | 'done' | 'error'

export default function AdminSetupPage() {
  const session = useZuriSession()
  const router = useRouter()
  const [state, setState] = useState<SetupState>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [otherAdminsExist, setOtherAdminsExist] = useState(false)

  useEffect(() => {
    if (session.status === 'loading') return
    if (session.status === 'unauthenticated') {
      router.push('/login')
      return
    }
    if (session.data?.isAdmin) {
      router.push('/admin')
      return
    }

    // During the pre-launch testing phase, setup is not gated on whether an
    // admin already exists — anyone who isn't already an admin can claim it.
    // hasAdmin is shown as an FYI only, never blocks the button.
    apiClient<{ hasAdmin: boolean }>('/api/admin/setup-status')
      .then((data) => setOtherAdminsExist(data.hasAdmin))
      .catch(() => { /* non-fatal — just skip the FYI note */ })
      .finally(() => setState('ready'))
  }, [session.status, session.data?.isAdmin, router])

  const claimAdmin = async () => {
    if (!session.data?.accessToken) return
    setState('claiming')
    try {
      const data = await apiClient<{ ok: boolean; token: string }>('/api/admin/setup', {
        method: 'POST',
        token: session.data.accessToken,
      })
      if (data.ok) {
        setState('done')
        setTimeout(() => router.push('/admin'), 1500)
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong')
      setState('error')
    }
  }

  const user = session.data?.user

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-lg">Z</span>
          </div>
          <span className="text-white font-bold text-xl">Zuri</span>
          <span className="text-gray-500 text-sm ml-1">Admin Setup</span>
        </div>

        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8">
          {state === 'loading' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Checking setup status…</p>
            </div>
          )}

          {state === 'ready' && (
            <div>
              <div className="w-14 h-14 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl">🛡️</span>
              </div>
              <h1 className="text-white font-bold text-xl mb-2 text-center">Set up admin access</h1>
              <p className="text-gray-400 text-sm mb-6 text-center">
                Claim admin access for your current account to enable the admin panel.
              </p>
              {otherAdminsExist && (
                <p className="text-gray-500 text-xs mb-4 text-center">
                  Other admin accounts already exist — this adds you as an additional admin.
                </p>
              )}

              {/* Current user info */}
              <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700">
                <p className="text-gray-400 text-xs uppercase tracking-wide font-semibold mb-2">Current account</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                    {user?.name?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{user?.name || 'User'}</p>
                    <p className="text-gray-400 text-xs">{user?.email}</p>
                  </div>
                </div>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
                <p className="text-amber-400 text-xs font-semibold mb-1">⚠️ One-time action</p>
                <p className="text-amber-300/80 text-xs leading-relaxed">
                  This grants full admin access to your account. This action can only be performed once — once claimed, admin access must be granted via the admin panel.
                </p>
              </div>

              <button
                onClick={claimAdmin}
                className="w-full py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
              >
                Claim admin access
              </button>
            </div>
          )}

          {state === 'claiming' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-sm">Setting up admin access…</p>
            </div>
          )}

          {state === 'done' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <svg className="w-7 h-7 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-white font-bold text-xl mb-2">Admin access granted</h1>
              <p className="text-gray-400 text-sm">Redirecting to the admin panel…</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center">
              <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-5">
                <span className="text-3xl">⚠️</span>
              </div>
              <h1 className="text-white font-bold text-xl mb-2">Something went wrong</h1>
              <p className="text-gray-400 text-sm mb-4">{errorMsg || 'Unable to complete setup. Please try again.'}</p>
              <button
                onClick={() => { setState('loading'); setErrorMsg(''); }}
                className="w-full py-3 bg-gray-800 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 transition-colors border border-gray-700"
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          This page is only accessible from the server running Zuri.
        </p>
      </div>
    </div>
  )
}
