'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'

interface WhatsAppStatus {
  connected: boolean
  phone?: string
  sessionState?: string
}

interface UserStats {
  totalContacts: number
  totalMessages: number
  totalSuggestions: number
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="divide-y divide-gray-50">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-3">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  )
}

export default function SettingsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)

  useEffect(() => {
    if (!token) return

    // Check API reachability + WhatsApp status
    apiClient<WhatsAppStatus>('/api/whatsapp/status', { token })
      .then((s) => { setWaStatus(s); setApiReachable(true) })
      .catch(() => { setWaStatus({ connected: false }); setApiReachable(false) })

    // Load user stats
    Promise.all([
      apiClient<{ contacts: unknown[] }>('/api/contacts', { token }).catch(() => ({ contacts: [] })),
      apiClient<{ stats: UserStats }>('/api/users/me/stats', { token }).catch(() => null),
    ]).then(([contacts, statsData]) => {
      setStats({
        totalContacts: (contacts as any).contacts?.length ?? 0,
        totalMessages: (statsData as any)?.stats?.totalMessages ?? 0,
        totalSuggestions: (statsData as any)?.stats?.totalSuggestions ?? 0,
      })
    })
  }, [token])

  const disconnect = async () => {
    if (!token) return
    setDisconnecting(true)
    try {
      await apiClient('/api/whatsapp/connect', { method: 'DELETE', token })
      setWaStatus({ connected: false })
    } finally {
      setDisconnecting(false)
    }
  }

  const initials = (() => {
    const name = session.data?.user.name
    if (!name) return session.data?.user.email?.charAt(0).toUpperCase() ?? '?'
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  })()

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <h1 className="font-semibold text-gray-900">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-xl mx-auto space-y-4">

          {/* API status banner */}
          {apiReachable === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <span>⚠️</span>
              <span>Backend not reachable — some features will be unavailable.</span>
            </div>
          )}

          {/* Profile card */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-white text-lg font-semibold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900 truncate">
                {session.data?.user.name || session.data?.user.email}
              </p>
              {session.data?.user.name && (
                <p className="text-sm text-gray-400 truncate">{session.data?.user.email}</p>
              )}
              <span className="mt-1 inline-block text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                Personal plan
              </span>
            </div>
          </div>

          {/* WhatsApp */}
          <Section title="WhatsApp Connection">
            {waStatus === null ? (
              <div className="px-5 py-4 text-sm text-gray-400">Checking status...</div>
            ) : waStatus.connected ? (
              <>
                <div className="px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Connected</p>
                      {waStatus.phone && (
                        <p className="text-xs text-gray-400 mt-0.5">{waStatus.phone}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={disconnect}
                    disabled={disconnecting}
                    className="text-sm text-red-500 hover:text-red-600 disabled:opacity-50 transition-colors"
                  >
                    {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              </>
            ) : (
              <div className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                  <p className="text-sm text-gray-500">Not connected</p>
                </div>
                <a
                  href="/onboarding"
                  className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Connect
                </a>
              </div>
            )}
          </Section>

          {/* Activity stats */}
          {stats && (
            <Section title="Activity">
              <Row label="Contacts tracked" value={stats.totalContacts.toLocaleString()} />
              <Row label="Messages analysed" value={stats.totalMessages.toLocaleString()} />
              <Row label="AI suggestions generated" value={stats.totalSuggestions.toLocaleString()} />
            </Section>
          )}

          {/* Intelligence settings */}
          <Section title="AI Intelligence">
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Proactive suggestions</p>
                <p className="text-xs text-gray-400 mt-0.5">Daily AI-generated relationship nudges</p>
              </div>
              <div className="w-9 h-5 bg-indigo-600 rounded-full flex items-center justify-end px-0.5 cursor-not-allowed opacity-70">
                <div className="w-4 h-4 bg-white rounded-full shadow" />
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Relationship clocks</p>
                <p className="text-xs text-gray-400 mt-0.5">Per-contact timing engine</p>
              </div>
              <div className="w-9 h-5 bg-indigo-600 rounded-full flex items-center justify-end px-0.5 cursor-not-allowed opacity-70">
                <div className="w-4 h-4 bg-white rounded-full shadow" />
              </div>
            </div>
            <div className="px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">World knowledge</p>
                <p className="text-xs text-gray-400 mt-0.5">Match news to contact interests</p>
              </div>
              <div className="w-9 h-5 bg-indigo-600 rounded-full flex items-center justify-end px-0.5 cursor-not-allowed opacity-70">
                <div className="w-4 h-4 bg-white rounded-full shadow" />
              </div>
            </div>
          </Section>

          {/* Account actions */}
          <Section title="Account">
            <div className="px-5 py-3">
              <p className="text-xs text-gray-400">
                Account managed via Clerk SSO. To change your email or password, visit your account settings.
              </p>
            </div>
          </Section>

        </div>
      </div>
    </div>
  )
}
