'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient, ApiError } from '@/lib/api'

// Admin side of the mobile-money payment flow — see
// docs/PRICING_PAYMENTS_PLAN.md §6. Mirrors admin/billing/page.tsx's
// dark-theme + useApi conventions exactly.

interface Payment {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  planName: string
  referenceCode: string
  amountNgwee: number
  paymentMethod: string
  status: string
  createdAt: string
}

function formatNgwee(ngwee: number): string {
  return `K${(ngwee / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const TABS = ['pending', 'approved', 'rejected'] as const

export default function AdminPaymentsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [tab, setTab] = useState<typeof TABS[number]>('pending')
  const { data, loading, refetch } = useApi<{ payments: Payment[] }>(
    `/api/admin/payments?status=${tab}`, token,
  )
  const [busyId, setBusyId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const payments = data?.payments ?? []

  const approve = async (id: string) => {
    if (!token) return
    setBusyId(id)
    setError(null)
    try {
      await apiClient(`/api/admin/payments/${id}/approve`, { method: 'POST', token })
      refetch()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Approve failed')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id: string) => {
    if (!token || !rejectReason.trim()) return
    setBusyId(id)
    setError(null)
    try {
      await apiClient(`/api/admin/payments/${id}/reject`, {
        method: 'POST', token, body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      setRejectingId(null)
      setRejectReason('')
      refetch()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reject failed')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">Payments</h1>
        <p className="text-gray-500 text-sm">Approve or reject mobile money payment requests</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-5 bg-red-950/50 border border-red-900 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="px-5 py-4 space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="h-16 bg-gray-800 rounded animate-pulse" />
            ))}
          </div>
        ) : payments.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-500 text-sm">No {tab} payment requests</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {payments.map((p) => (
              <div key={p.id} className="px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{p.userName || p.userEmail}</p>
                    <p className="text-gray-500 text-xs">{p.userEmail}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white text-sm font-bold tabular-nums">{formatNgwee(p.amountNgwee)}</p>
                    <p className="text-gray-500 text-xs">{p.planName}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 mt-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/50 border border-indigo-900 rounded-md px-2 py-1">
                      {p.referenceCode}
                    </span>
                    <span className="text-gray-600 text-xs whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  {tab === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => approve(p.id)}
                        disabled={busyId === p.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => setRejectingId(rejectingId === p.id ? null : p.id)}
                        disabled={busyId === p.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
                {rejectingId === p.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      autoFocus
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Reason (e.g. wrong amount, duplicate reference)"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      onClick={() => reject(p.id)}
                      disabled={!rejectReason.trim() || busyId === p.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-500 disabled:opacity-40 transition-colors"
                    >
                      Confirm reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
