'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Gift } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { PageHeader } from '@/components/ui'

// Membership Platform Phase 7 — the recipient's side of a gift membership:
// apply a redemption code to their own account.
export default function RedeemGiftPage() {
  const params = useParams<{ code: string }>()
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const redeem = async () => {
    if (!token) return
    setStatus('loading')
    setError(null)
    try {
      await apiClient(`/api/gifts/redeem/${params.code}`, { method: 'POST', token })
      setStatus('done')
      setTimeout(() => router.push('/billing'), 2000)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not redeem this gift')
      setStatus('error')
    }
  }

  return (
    <div className="flex flex-col h-full bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)]">
      <PageHeader title="Redeem a gift" />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-[2rem] bg-white shadow-2xl shadow-indigo-200/40 ring-1 ring-white p-8 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-4">
            <Gift className="w-7 h-7" />
          </div>
          <p className="text-lg font-black text-gray-950">Gift code {params.code}</p>
          <p className="text-sm text-gray-500 mt-2">
            {status === 'done'
              ? "Redeemed! Taking you to Billing…"
              : 'Redeeming applies this membership to your account immediately.'}
          </p>
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
          {status !== 'done' && (
            <button
              onClick={redeem}
              disabled={status === 'loading' || !token}
              className="mt-5 w-full rounded-2xl bg-indigo-600 text-white py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {status === 'loading' ? 'Redeeming…' : 'Redeem gift'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
