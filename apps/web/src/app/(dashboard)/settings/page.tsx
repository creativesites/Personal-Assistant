'use client'

import { useEffect, useState } from 'react'
import { useZuriSession, setStoredMode } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { Tabs, ModeBadge, useToast } from '@/components/ui'

type WorkspaceMode = 'business' | 'personal' | 'hybrid'

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

const MODE_OPTIONS: {
  value: WorkspaceMode
  label: string
  description: string
  tier: string | null
}[] = [
  {
    value: 'business',
    label: 'Business',
    description: 'Customer relationships, deals, and support. WhatsApp as your CRM.',
    tier: null,
  },
  {
    value: 'personal',
    label: 'Personal',
    description: 'Family, friends, and personal relationships. AI relationship coach.',
    tier: 'Starter+',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    description: 'Full access to both business and personal intelligence engines.',
    tier: 'Pro',
  },
]

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

function Toggle({ enabled }: { enabled: boolean }) {
  return (
    <div
      className={`w-9 h-5 rounded-full flex items-center px-0.5 cursor-not-allowed opacity-70 ${enabled ? 'bg-indigo-600 justify-end' : 'bg-gray-200 justify-start'}`}
    >
      <div className="w-4 h-4 bg-white rounded-full shadow" />
    </div>
  )
}

export default function SettingsPage() {
  const session = useZuriSession()
  const { addToast } = useToast()
  const token = session.data?.accessToken
  const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)
  const [pendingMode, setPendingMode] = useState<WorkspaceMode>(session.data?.mode ?? 'business')
  const [savingMode, setSavingMode] = useState(false)

  // Sync pendingMode with session once it loads
  useEffect(() => {
    if (session.data?.mode) setPendingMode(session.data.mode)
  }, [session.data?.mode])

  useEffect(() => {
    if (!token) return

    apiClient<WhatsAppStatus>('/api/whatsapp/status', { token })
      .then((s) => { setWaStatus(s); setApiReachable(true) })
      .catch(() => { setWaStatus({ connected: false }); setApiReachable(false) })

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

  const saveMode = async () => {
    if (!token || pendingMode === session.data?.mode) return
    setSavingMode(true)
    try {
      await apiClient<{ user: { mode: WorkspaceMode } }>('/api/users/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ mode: pendingMode }),
      })
      setStoredMode(pendingMode)
      addToast({ variant: 'success', title: 'Workspace mode updated' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to save mode', description: 'Please try again.' })
    } finally {
      setSavingMode(false)
    }
  }

  const initials = (() => {
    const name = session.data?.user.name
    if (!name) return session.data?.user.email?.charAt(0).toUpperCase() ?? '?'
    return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  })()

  const tabs = [
    { id: 'account', label: 'Account' },
    { id: 'workspace', label: 'Workspace' },
    { id: 'intelligence', label: 'Intelligence' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center px-6 shrink-0">
        <h1 className="font-semibold text-gray-900">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-xl mx-auto space-y-4">

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
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">
                {session.data?.user.name || session.data?.user.email}
              </p>
              {session.data?.user.name && (
                <p className="text-sm text-gray-400 truncate">{session.data?.user.email}</p>
              )}
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                  Free plan
                </span>
                <ModeBadge mode={session.data?.mode ?? 'business'} />
              </div>
            </div>
          </div>

          <Tabs tabs={tabs} defaultTab="account">
            {(activeTab) => (
              <>
                {/* ── Account tab ── */}
                {activeTab === 'account' && (
                  <div className="space-y-4 pt-2">
                    {/* WhatsApp */}
                    <Section title="WhatsApp Connection">
                      {waStatus === null ? (
                        <div className="px-5 py-4 text-sm text-gray-400">Checking status...</div>
                      ) : waStatus.connected ? (
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

                    {/* Account */}
                    <Section title="Account">
                      <div className="px-5 py-3">
                        <p className="text-xs text-gray-400">
                          Account managed via Clerk SSO. To change your email or password, visit your account settings.
                        </p>
                      </div>
                    </Section>
                  </div>
                )}

                {/* ── Workspace tab ── */}
                {activeTab === 'workspace' && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <p className="text-sm text-gray-500 mb-3">
                        Choose how Zuri operates. This controls which intelligence engines run and which features appear in your dashboard.
                      </p>

                      <div className="space-y-2">
                        {MODE_OPTIONS.map((opt) => {
                          const selected = pendingMode === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPendingMode(opt.value)}
                              className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-all ${
                                selected
                                  ? 'border-indigo-600 bg-indigo-50'
                                  : 'border-gray-200 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  selected ? 'border-indigo-600' : 'border-gray-300'
                                }`}>
                                  {selected && (
                                    <div className="w-2 h-2 rounded-full bg-indigo-600" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <ModeBadge mode={opt.value} />
                                    {opt.tier && (
                                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-medium">
                                        {opt.tier}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-gray-600 mt-1">{opt.description}</p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-xs text-gray-400">
                          Personal and Hybrid modes unlock relationship intelligence features.
                        </p>
                        <button
                          type="button"
                          onClick={saveMode}
                          disabled={savingMode || pendingMode === session.data?.mode || !token}
                          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          {savingMode ? 'Saving…' : 'Save Mode'}
                        </button>
                      </div>
                    </div>

                    {/* What each mode enables */}
                    <Section title="What's included">
                      {[
                        { label: 'WhatsApp inbox', modes: ['business', 'personal', 'hybrid'] },
                        { label: 'AI reply drafts', modes: ['business', 'personal', 'hybrid'] },
                        { label: 'Proactive follow-up queue', modes: ['business', 'personal', 'hybrid'] },
                        { label: 'Customer / contact profiles', modes: ['business', 'personal', 'hybrid'] },
                        { label: 'Relationship health tracking', modes: ['personal', 'hybrid'] },
                        { label: 'Personal relationship coaching', modes: ['personal', 'hybrid'] },
                        { label: 'Dual intelligence engines', modes: ['hybrid'] },
                      ].map((row) => {
                        const enabled = row.modes.includes(pendingMode)
                        return (
                          <div key={row.label} className="flex items-center justify-between px-5 py-3">
                            <span className={`text-sm ${enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                              {row.label}
                            </span>
                            {enabled ? (
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
                              </svg>
                            )}
                          </div>
                        )
                      })}
                    </Section>
                  </div>
                )}

                {/* ── Intelligence tab ── */}
                {activeTab === 'intelligence' && (
                  <div className="space-y-4 pt-2">
                    <Section title="AI Engines">
                      <div className="px-5 py-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Proactive suggestions</p>
                          <p className="text-xs text-gray-400 mt-0.5">Daily AI-generated relationship nudges</p>
                        </div>
                        <Toggle enabled />
                      </div>
                      <div className="px-5 py-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Relationship clocks</p>
                          <p className="text-xs text-gray-400 mt-0.5">Per-contact timing engine</p>
                        </div>
                        <Toggle enabled />
                      </div>
                      <div className="px-5 py-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">World knowledge</p>
                          <p className="text-xs text-gray-400 mt-0.5">Match news to contact interests</p>
                        </div>
                        <Toggle enabled />
                      </div>
                      <div className="px-5 py-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Voice matching</p>
                          <p className="text-xs text-gray-400 mt-0.5">Reply drafts in your writing style</p>
                        </div>
                        <Toggle enabled />
                      </div>
                    </Section>
                    <p className="text-xs text-gray-400 px-1">
                      Engine configuration managed by your subscription plan. Granular controls available on Pro.
                    </p>
                  </div>
                )}
              </>
            )}
          </Tabs>

        </div>
      </div>
    </div>
  )
}
