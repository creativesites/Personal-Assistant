'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui'
import { apiClient, ApiError } from '@/lib/api'

// Membership Platform Phase 3 (docs/MEMBERSHIP_PLATFORM_PLAN.md) — the
// guided 4-step manual mobile-money flow: choose plan + cadence (already
// picked before this modal opens) + optional BYOK discount -> choose
// network -> pay-to details -> self-reported confirmation.

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface GuidedPaymentPlan {
  id: string
  name: string
  priceFormatted: string
  priceNgweeByok: number | null
  priceByokFormatted: string | null
  billingPeriod: string | null
}

interface CheckoutResponse {
  paymentRequestId: string
  referenceCode: string
  amountFormatted: string
  usesOwnApiKey: boolean
  planName: string
  mobileMoneyNumbers: { airtel: string; mtn: string }
}

type Step = 'plan' | 'network' | 'pay' | 'confirm' | 'waiting'

export function GuidedPaymentModal({
  plan, token, onClose, onDone, hasByokKey,
}: {
  plan: GuidedPaymentPlan | null
  token: string | null | undefined
  onClose: () => void
  onDone: () => void
  hasByokKey: boolean
}) {
  const [step, setStep] = useState<Step>('plan')
  const [useOwnApiKey, setUseOwnApiKey] = useState(false)
  const [network, setNetwork] = useState<'airtel' | 'mtn' | null>(null)
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState<'number' | 'reference' | null>(null)

  const [phoneNumber, setPhoneNumber] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [screenshot, setScreenshot] = useState<File | null>(null)

  if (!plan) return null

  const reset = () => {
    setStep('plan'); setUseOwnApiKey(false); setNetwork(null); setCheckout(null)
    setError(null); setPhoneNumber(''); setPaidAt(''); setScreenshot(null); setCopied(null)
  }

  const close = () => { reset(); onClose() }

  const startCheckout = async () => {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const res = await apiClient<CheckoutResponse>('/api/subscriptions/checkout', {
        method: 'POST', token,
        body: JSON.stringify({ planId: plan.id, useOwnApiKey }),
      })
      setCheckout(res)
      setStep('pay')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout')
    } finally {
      setLoading(false)
    }
  }

  const copy = (text: string, which: 'number' | 'reference') => {
    navigator.clipboard?.writeText(text)
    setCopied(which)
    setTimeout(() => setCopied(null), 2000)
  }

  const submitConfirmation = async () => {
    if (!token || !checkout) return
    setLoading(true); setError(null)
    try {
      if (screenshot) {
        const formData = new FormData()
        formData.append('phoneNumber', phoneNumber)
        if (paidAt) formData.append('paidAt', new Date(paidAt).toISOString())
        formData.append('screenshot', screenshot)
        const res = await fetch(`${API_URL}/api/subscriptions/checkout/${checkout.paymentRequestId}/confirm`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: 'Confirmation failed' }))
          throw new Error(body.error || 'Confirmation failed')
        }
      } else {
        await apiClient(`/api/subscriptions/checkout/${checkout.paymentRequestId}/confirm`, {
          method: 'POST', token,
          body: JSON.stringify({ phoneNumber, paidAt: paidAt ? new Date(paidAt).toISOString() : undefined }),
        })
      }
      onDone()
      close()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Confirmation failed')
    } finally {
      setLoading(false)
    }
  }

  const stepTitle: Record<Step, string> = {
    plan: 'Confirm your plan',
    network: 'Choose network',
    pay: 'Send payment',
    confirm: "I've sent it",
    waiting: 'Waiting for confirmation',
  }

  return (
    <Modal open={!!plan} onClose={close} title={stepTitle[step]} size="sm">
      <div className="space-y-4">
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">{error}</div>
        )}

        {step === 'plan' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-cyan-50 ring-1 ring-indigo-100 p-4">
              <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">{plan.billingPeriod ?? 'plan'}</p>
              <p className="text-lg font-black text-gray-950 mt-0.5">{plan.name}</p>
              <p className="text-2xl font-black tracking-tight text-gray-950 mt-1">
                {useOwnApiKey && plan.priceByokFormatted ? plan.priceByokFormatted : plan.priceFormatted}
              </p>
            </div>
            {plan.priceNgweeByok !== null && hasByokKey && (
              <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-3 py-3 text-sm cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox" checked={useOwnApiKey}
                  onChange={(e) => setUseOwnApiKey(e.target.checked)}
                  className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>
                  <span className="font-semibold text-gray-900">I'll bring my own AI API key</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Save with {plan.priceByokFormatted} since your own key covers AI usage.
                  </span>
                </span>
              </label>
            )}
            {plan.priceNgweeByok !== null && !hasByokKey && (
              <p className="text-xs text-gray-400">
                Save with a BYOK discount by adding your own AI API key under Settings → Enterprise first.
              </p>
            )}
            <button
              onClick={() => setStep('network')}
              className="w-full rounded-2xl bg-indigo-600 text-white py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {step === 'network' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Which mobile money network will you pay from?</p>
            <div className="grid grid-cols-2 gap-3">
              {(['airtel', 'mtn'] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setNetwork(n)}
                  className={`rounded-2xl border-2 px-4 py-4 text-sm font-bold transition-colors ${
                    network === n ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {n === 'airtel' ? 'Airtel Money' : 'MTN MoMo'}
                </button>
              ))}
            </div>
            <button
              onClick={startCheckout}
              disabled={!network || loading}
              className="w-full rounded-2xl bg-indigo-600 text-white py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Preparing…' : 'Continue'}
            </button>
          </div>
        )}

        {step === 'pay' && checkout && network && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Send <strong className="text-gray-900">{checkout.amountFormatted}</strong> to the {network === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} number
              below, with the reference code as the payment note.
            </p>
            <div className="rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{network === 'airtel' ? 'Airtel Money' : 'MTN MoMo'} number</p>
                <p className="text-base font-mono font-bold text-gray-900">{checkout.mobileMoneyNumbers[network]}</p>
              </div>
              <button
                onClick={() => copy(checkout.mobileMoneyNumbers[network], 'number')}
                className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
              >
                {copied === 'number' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="rounded-2xl border border-gray-200 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Reference code</p>
                <p className="text-base font-mono font-bold text-gray-900 tracking-wider">{checkout.referenceCode}</p>
              </div>
              <button
                onClick={() => copy(checkout.referenceCode, 'reference')}
                className="rounded-xl bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200"
              >
                {copied === 'reference' ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => setStep('confirm')}
              className="w-full rounded-2xl bg-indigo-600 text-white py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 transition-colors"
            >
              I Have Paid
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">A couple of details so an admin can match your payment faster.</p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Phone number you paid from</label>
              <input
                type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. 097XXXXXXX"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">When did you pay? (optional)</label>
              <input
                type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Screenshot (optional)</label>
              <input
                type="file" accept="image/*"
                onChange={(e) => setScreenshot(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
              />
            </div>
            <button
              onClick={submitConfirmation}
              disabled={!phoneNumber || loading}
              className="w-full rounded-2xl bg-indigo-600 text-white py-2.5 text-sm font-semibold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {loading ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}

        {step === 'waiting' && (
          <div className="text-center py-4 space-y-3">
            <div className="mx-auto w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl">✓</div>
            <p className="text-sm font-semibold text-gray-900">Waiting for confirmation</p>
            <p className="text-xs text-gray-500">Estimated confirmation time: 5–30 minutes. We'll unlock your plan the moment it's matched.</p>
            <button onClick={close} className="rounded-2xl bg-gray-100 text-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-200">
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
