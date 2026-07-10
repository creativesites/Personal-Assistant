'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface UserDetail {
  user: {
    id: string; email: string; name: string | null; mode: string; marketingAccess: string; timezone: string
    isAdmin: boolean; onboardingCompleted: boolean; suspended: boolean
    createdAt: string; plan: string
    whatsapp: { status: string; phone: string | null; lastConnectedAt: string | null; reconnectCount: number }
    stats: { contacts: number; messages: number; suggestions: number }
  }
  auditLog: { action: string; details: unknown; created_at: string }[]
}

const PLAN_OPTIONS = ['free', 'pro', 'business'] as const
const MARKETING_ACCESS_OPTIONS = ['none', 'waitlisted', 'beta', 'enabled'] as const

export default function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken

  const { data, loading, refetch } = useApi<UserDetail>(`/api/admin/users/${id}`, token)
  const [saving, setSaving] = useState<string | null>(null)

  const patch = async (body: Record<string, unknown>, label: string) => {
    if (!token) return
    setSaving(label)
    try {
      await apiClient(`/api/admin/users/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) })
      await refetch()
    } finally {
      setSaving(null)
    }
  }

  if (loading || !data) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { user, auditLog } = data

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.push('/admin/users')} className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
          <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-white">{user.name || 'User'}</h1>
          <p className="text-gray-500 text-sm">{user.email}</p>
        </div>
        {user.isAdmin && (
          <span className="text-xs bg-indigo-900/50 text-indigo-300 border border-indigo-700/50 px-2 py-1 rounded font-semibold">ADMIN</span>
        )}
        {user.suspended && (
          <span className="text-xs bg-red-900/50 text-red-300 border border-red-700/50 px-2 py-1 rounded font-semibold">SUSPENDED</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Account info */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Account</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {[
              { label: 'Email', value: user.email },
              { label: 'Mode', value: user.mode },
              { label: 'Zuri Marketing', value: user.marketingAccess },
              { label: 'Timezone', value: user.timezone || '—' },
              { label: 'Onboarded', value: user.onboardingCompleted ? 'Yes' : 'No' },
              { label: 'Joined', value: new Date(user.createdAt).toLocaleDateString() },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="text-white capitalize">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Usage stats</p>
          </div>
          <div className="px-5 py-4 grid grid-cols-3 gap-4">
            {[
              { label: 'Contacts', value: user.stats.contacts },
              { label: 'Messages', value: user.stats.messages },
              { label: 'Suggestions', value: user.stats.suggestions },
            ].map(({ label, value }) => (
              <div key={label} className="text-center">
                <p className="text-2xl font-extrabold text-white tabular-nums">{value.toLocaleString()}</p>
                <p className="text-gray-500 text-xs mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* WhatsApp */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">WhatsApp session</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {[
              { label: 'Status', value: user.whatsapp.status },
              { label: 'Phone', value: user.whatsapp.phone || '—' },
              { label: 'Last connected', value: user.whatsapp.lastConnectedAt ? new Date(user.whatsapp.lastConnectedAt).toLocaleString() : '—' },
              { label: 'Reconnect count', value: String(user.whatsapp.reconnectCount) },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-gray-500">{label}</span>
                <span className={`capitalize ${value === 'connected' ? 'text-green-400' : value === 'error' ? 'text-red-400' : 'text-white'}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin actions</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            {/* Plan */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Change plan</p>
              <div className="flex gap-2">
                {PLAN_OPTIONS.map((plan) => (
                  <button
                    key={plan}
                    disabled={saving === 'plan' || user.plan === plan}
                    onClick={() => patch({ plan }, 'plan')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                      user.plan === plan
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                    } disabled:opacity-50`}
                  >
                    {plan}
                  </button>
                ))}
              </div>
            </div>

            {/* Zuri Marketing access */}
            <div>
              <p className="text-xs text-gray-500 mb-2">Zuri Marketing access</p>
              <div className="flex gap-2">
                {MARKETING_ACCESS_OPTIONS.map((access) => (
                  <button
                    key={access}
                    disabled={saving === 'marketingAccess' || user.marketingAccess === access}
                    onClick={() => patch({ marketingAccess: access }, 'marketingAccess')}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors capitalize ${
                      user.marketingAccess === access
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                    } disabled:opacity-50`}
                  >
                    {access}
                  </button>
                ))}
              </div>
            </div>

            {/* Suspend */}
            <button
              disabled={saving === 'suspend'}
              onClick={() => patch({ suspend: !user.suspended }, 'suspend')}
              className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                user.suspended
                  ? 'bg-green-800/40 text-green-300 hover:bg-green-800/60'
                  : 'bg-red-800/40 text-red-300 hover:bg-red-800/60'
              } disabled:opacity-50`}
            >
              {saving === 'suspend' ? 'Saving…' : user.suspended ? 'Unsuspend account' : 'Suspend account'}
            </button>

            {/* Admin toggle */}
            {!user.isAdmin && (
              <button
                disabled={saving === 'admin'}
                onClick={() => patch({ isAdmin: true }, 'admin')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-indigo-800/40 text-indigo-300 hover:bg-indigo-800/60 disabled:opacity-50 transition-colors"
              >
                {saving === 'admin' ? 'Saving…' : 'Promote to admin'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Audit log */}
      {auditLog.length > 0 && (
        <div className="mt-5 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Admin action history</p>
          </div>
          <div className="divide-y divide-gray-800">
            {auditLog.map((log, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-xs">
                <span className="text-gray-300 font-mono">{log.action}</span>
                <span className="text-gray-600">{new Date(log.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
