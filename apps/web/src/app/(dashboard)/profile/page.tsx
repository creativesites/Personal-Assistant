'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { ModeBadge, PageHeader, SkeletonCard, useToast } from '@/components/ui'

interface WhatsAppStatus {
  connected: boolean
  phone?: string
  sessionState?: string
  lastConnectedAt?: string
}

interface UserStats {
  totalContacts: number
  totalMessages: number
  totalSuggestions: number
}

function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center">
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}

export default function ProfilePage() {
  const session = useZuriSession()
  const { addToast } = useToast()
  const token = session.data?.accessToken

  const { data: waData } = useApi<WhatsAppStatus>('/api/whatsapp/status', token)
  const { data: statsData } = useApi<{ stats: UserStats }>('/api/users/me/stats', token)
  const [disconnecting, setDisconnecting] = useState(false)

  const user = session.data?.user
  const mode = session.data?.mode ?? 'business'
  const stats = statsData?.stats

  const initials = (() => {
    const name = user?.name
    if (!name) return user?.email?.charAt(0).toUpperCase() ?? '?'
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  })()

  const disconnect = async () => {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiClient('/api/whatsapp/connect', { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'WhatsApp disconnected' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to disconnect', description: 'Please try again.' })
    } finally {
      setDisconnecting(false)
    }
  }

  if (session.status === 'loading') {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Profile" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-xl mx-auto w-full">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Profile" />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-xl mx-auto space-y-4">

          {/* Avatar + name */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-shrink-0">
                <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold">
                  {initials}
                </div>
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${
                  waData?.connected ? 'bg-green-500' : 'bg-gray-300'
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900 truncate">{user?.name || user?.email}</h2>
                {user?.name && user?.email && (
                  <p className="text-sm text-gray-500 truncate">{user.email}</p>
                )}
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <ModeBadge mode={mode} />
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">Free plan</span>
                </div>
              </div>
            </div>

            {/* Stats row */}
            {stats && (
              <div className="flex items-center justify-around py-3 border-t border-gray-100">
                <StatPill label="Contacts" value={stats.totalContacts.toLocaleString()} />
                <div className="w-px h-8 bg-gray-100" />
                <StatPill label="Messages" value={stats.totalMessages.toLocaleString()} />
                <div className="w-px h-8 bg-gray-100" />
                <StatPill label="Suggestions" value={stats.totalSuggestions.toLocaleString()} />
              </div>
            )}
          </div>

          {/* WhatsApp connection */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WhatsApp</p>
            </div>
            {waData?.connected ? (
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
                    <span className="text-green-600 text-lg">📱</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Connected</p>
                    {waData.phone && <p className="text-xs text-gray-400 mt-0.5">{waData.phone}</p>}
                  </div>
                </div>
                <button
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50 font-medium transition-colors"
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            ) : (
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                    <span className="text-gray-400 text-lg">📵</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Not connected</p>
                    <p className="text-xs text-gray-400 mt-0.5">Connect to start using Zuri</p>
                  </div>
                </div>
                <Link
                  href="/onboarding"
                  className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  Connect
                </Link>
              </div>
            )}
          </div>

          {/* Workspace */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Workspace</p>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Current mode</p>
                <ModeBadge mode={mode} />
              </div>
              <Link
                href="/settings"
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                Change →
              </Link>
            </div>
          </div>

          {/* Account actions */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account</p>
            </div>
            <div className="divide-y divide-gray-50">
              <Link
                href="/settings"
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700">Settings</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/billing"
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700">Billing & plan</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/diagnostics"
                className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700">Diagnostics</span>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <div className="px-5 py-3.5">
                <p className="text-xs text-gray-400">Account managed via Clerk SSO. To update your email or password, visit your Clerk account portal.</p>
              </div>
            </div>
          </div>

          {/* Sign out */}
          <Link
            href="/api/auth/sign-out"
            className="flex items-center justify-center w-full py-3 border border-red-200 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            Sign out
          </Link>
        </div>
      </div>
    </div>
  )
}
