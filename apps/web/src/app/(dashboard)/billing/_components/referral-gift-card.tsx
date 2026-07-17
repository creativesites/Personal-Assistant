'use client'

import { useState } from 'react'
import { Gift, Share2 } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { apiClient, ApiError } from '@/lib/api'

// Membership Platform Phase 7 — referral code display (lazy-created on
// first visit here) + a minimal gift-membership creation form.

interface ReferralInfo {
  code: string
  totalReferred: number
  totalRewarded: number
  rewardDays: number
}

export function ReferralGiftCard({
  token, plans,
}: {
  token: string | null | undefined
  plans: { id: string; name: string; priceFormatted: string }[]
}) {
  const { data: referral } = useApi<ReferralInfo>('/api/referrals/me', token)
  const [copied, setCopied] = useState(false)
  const [showGiftForm, setShowGiftForm] = useState(false)
  const [recipientName, setRecipientName] = useState('')
  const [recipientContact, setRecipientContact] = useState('')
  const [giftPlanId, setGiftPlanId] = useState(plans[0]?.id ?? '')
  const [giftResult, setGiftResult] = useState<{ redemptionCode: string; referenceCode: string; amountNgwee: number } | null>(null)
  const [giftError, setGiftError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const copyCode = () => {
    if (!referral) return
    navigator.clipboard?.writeText(referral.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const createGift = async () => {
    if (!token || !recipientName.trim() || !recipientContact.trim() || !giftPlanId) return
    setCreating(true)
    setGiftError(null)
    try {
      const res = await apiClient<{ redemptionCode: string; referenceCode: string; amountNgwee: number }>('/api/gifts', {
        method: 'POST', token,
        body: JSON.stringify({ recipientName, recipientContact, planId: giftPlanId }),
      })
      setGiftResult(res)
    } catch (e) {
      setGiftError(e instanceof ApiError ? e.message : 'Could not create gift')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-2xl bg-violet-50 text-violet-600 flex items-center justify-center">
            <Share2 className="w-4 h-4" />
          </div>
          <p className="text-sm font-semibold text-gray-900">Invite a friend</p>
        </div>
      </div>

      {referral && (
        <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 ring-1 ring-indigo-100 p-4">
          <p className="text-xs text-gray-600">
            Share your code — when a friend subscribes, you both get <strong>{referral.rewardDays} extra days</strong>.
          </p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-lg font-mono font-bold text-gray-900 tracking-wider">{referral.code}</span>
            <button onClick={copyCode} className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-sm hover:bg-indigo-50">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">{referral.totalReferred} referred · {referral.totalRewarded} rewarded</p>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Gift className="w-4 h-4" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Gift a membership</p>
          </div>
          <button onClick={() => setShowGiftForm((s) => !s)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
            {showGiftForm ? 'Cancel' : 'Gift now'}
          </button>
        </div>

        {showGiftForm && !giftResult && (
          <div className="mt-3 space-y-2">
            <input
              value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Recipient's name"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={recipientContact} onChange={(e) => setRecipientContact(e.target.value)} placeholder="Recipient's phone or email"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <select
              value={giftPlanId} onChange={(e) => setGiftPlanId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.priceFormatted}</option>)}
            </select>
            {giftError && <p className="text-xs text-red-600">{giftError}</p>}
            <button
              onClick={createGift} disabled={creating || !recipientName.trim() || !recipientContact.trim()}
              className="w-full rounded-xl bg-indigo-600 text-white py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {creating ? 'Creating…' : 'Create gift'}
            </button>
          </div>
        )}

        {giftResult && (
          <div className="mt-3 rounded-2xl bg-emerald-50 ring-1 ring-emerald-100 p-3 text-xs text-emerald-800">
            <p>Pay the reference code <strong>{giftResult.referenceCode}</strong> as usual on the Billing page. Once
              confirmed, share this redemption code with the recipient:</p>
            <p className="mt-2 text-sm font-mono font-bold text-emerald-900">{giftResult.redemptionCode}</p>
          </div>
        )}
      </div>
    </div>
  )
}
