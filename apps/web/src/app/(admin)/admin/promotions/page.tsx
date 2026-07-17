'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient, ApiError } from '@/lib/api'

// Membership Platform Phase 7 — admin side of the Promotion Engine. Mirrors
// admin/payments/page.tsx's dark-theme + useApi conventions exactly.

interface PromoCode {
  id: string
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  applicablePlanFamily: string | null
  maxRedemptions: number | null
  timesRedeemed: number
  validUntil: string | null
  isActive: boolean
}

interface Gift {
  id: string
  recipientName: string
  recipientContact: string
  redemptionCode: string
  status: string
  gifterEmail: string
  planName: string
  createdAt: string
}

interface StudentVerification {
  id: string
  institutionName: string
  studentIdNumber: string
  status: string
  rejectedReason: string | null
  userEmail: string
  userName: string | null
  createdAt: string
}

const SUB_TABS = ['promo-codes', 'gifts', 'student-verification'] as const
type SubTab = typeof SUB_TABS[number]

function PromoCodesPanel({ token }: { token: string | null | undefined }) {
  const { data, loading, refetch } = useApi<{ promoCodes: PromoCode[] }>('/api/admin/promo-codes', token)
  const [creating, setCreating] = useState(false)
  const [code, setCode] = useState('')
  const [discountValue, setDiscountValue] = useState('50')
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    if (!token || !code.trim()) return
    setCreating(true)
    setError(null)
    try {
      await apiClient('/api/admin/promo-codes', {
        method: 'POST', token,
        body: JSON.stringify({ code: code.trim(), discountType: 'percent', discountValue: Number(discountValue) }),
      })
      setCode(''); setDiscountValue('50')
      refetch()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create promo code')
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (pc: PromoCode) => {
    if (!token) return
    await apiClient(`/api/admin/promo-codes/${pc.id}`, {
      method: 'PATCH', token, body: JSON.stringify({ isActive: !pc.isActive }),
    })
    refetch()
  }

  return (
    <div className="space-y-5">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME50"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Discount %</label>
          <input value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} type="number" min={1} max={100}
            className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500" />
        </div>
        <button onClick={create} disabled={creating || !code.trim()}
          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
          Create code
        </button>
      </div>

      {error && <div className="bg-red-950/50 border border-red-900 rounded-xl px-4 py-3 text-sm text-red-300">{error}</div>}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        {loading ? (
          <div className="px-5 py-4 text-gray-500 text-sm">Loading…</div>
        ) : !data?.promoCodes.length ? (
          <div className="px-5 py-10 text-center text-gray-500 text-sm">No promo codes yet</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {data.promoCodes.map((pc) => (
              <div key={pc.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-white text-sm font-mono font-bold">{pc.code}</p>
                  <p className="text-gray-500 text-xs">
                    {pc.discountType === 'percent' ? `${pc.discountValue}% off` : `K${(pc.discountValue / 100).toFixed(2)} off`}
                    {pc.applicablePlanFamily ? ` · ${pc.applicablePlanFamily} only` : ''}
                    {' · '}{pc.timesRedeemed}{pc.maxRedemptions ? `/${pc.maxRedemptions}` : ''} redeemed
                  </p>
                </div>
                <button onClick={() => toggleActive(pc)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    pc.isActive ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}>
                  {pc.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function GiftsPanel({ token }: { token: string | null | undefined }) {
  const { data, loading } = useApi<{ gifts: Gift[] }>('/api/admin/gifts', token)
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {loading ? (
        <div className="px-5 py-4 text-gray-500 text-sm">Loading…</div>
      ) : !data?.gifts.length ? (
        <div className="px-5 py-10 text-center text-gray-500 text-sm">No gift memberships yet</div>
      ) : (
        <div className="divide-y divide-gray-800">
          {data.gifts.map((g) => (
            <div key={g.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">To: {g.recipientName} ({g.recipientContact})</p>
                <p className="text-gray-500 text-xs">From {g.gifterEmail} · {g.planName}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/50 border border-indigo-900 rounded-md px-2 py-1">
                  {g.redemptionCode}
                </span>
                <p className="text-gray-500 text-xs mt-1 capitalize">{g.status.replace('_', ' ')}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StudentVerificationPanel({ token }: { token: string | null | undefined }) {
  const { data, loading, refetch } = useApi<{ verifications: StudentVerification[] }>(
    '/api/admin/student-verifications?status=pending', token,
  )
  const [busyId, setBusyId] = useState<string | null>(null)

  const approve = async (id: string) => {
    if (!token) return
    setBusyId(id)
    try {
      await apiClient(`/api/admin/student-verifications/${id}/approve`, { method: 'POST', token })
      refetch()
    } finally {
      setBusyId(null)
    }
  }
  const reject = async (id: string) => {
    if (!token) return
    setBusyId(id)
    try {
      await apiClient(`/api/admin/student-verifications/${id}/reject`, {
        method: 'POST', token, body: JSON.stringify({ reason: 'Could not verify enrollment' }),
      })
      refetch()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {loading ? (
        <div className="px-5 py-4 text-gray-500 text-sm">Loading…</div>
      ) : !data?.verifications.length ? (
        <div className="px-5 py-10 text-center text-gray-500 text-sm">No pending student verifications</div>
      ) : (
        <div className="divide-y divide-gray-800">
          {data.verifications.map((sv) => (
            <div key={sv.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{sv.userName || sv.userEmail}</p>
                <p className="text-gray-500 text-xs">{sv.institutionName} · ID {sv.studentIdNumber}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => approve(sv.id)} disabled={busyId === sv.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-500 disabled:opacity-40 transition-colors">
                  Approve
                </button>
                <button onClick={() => reject(sv.id)} disabled={busyId === sv.id}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 text-gray-300 hover:bg-gray-700 disabled:opacity-40 transition-colors">
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function AdminPromotionsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [tab, setTab] = useState<SubTab>('promo-codes')

  const labels: Record<SubTab, string> = {
    'promo-codes': 'Promo Codes', gifts: 'Gift Memberships', 'student-verification': 'Student Verification',
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">Promotions</h1>
        <p className="text-gray-500 text-sm">Promo codes, gift memberships, and student verification</p>
      </div>

      <div className="flex items-center gap-2 mb-5">
        {SUB_TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-800'
            }`}>
            {labels[t]}
          </button>
        ))}
      </div>

      {tab === 'promo-codes' && <PromoCodesPanel token={token} />}
      {tab === 'gifts' && <GiftsPanel token={token} />}
      {tab === 'student-verification' && <StudentVerificationPanel token={token} />}
    </div>
  )
}
