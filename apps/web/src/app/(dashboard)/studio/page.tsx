'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Send, Sparkles, Radio, Link2, Check } from 'lucide-react'
import { useZuriSession, setStoredMarketingAccess } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Button, EmptyState, PageHeader, SkeletonCard, useToast } from '@/components/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  quantity: number
  status: string
  createdAt: string
}

// ─── Waitlist pitch (marketing_access = none | waitlisted) ───────────────────

function WaitlistPitch({ waitlisted }: { waitlisted: boolean }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [joining, setJoining] = useState(false)

  const joinWaitlist = useCallback(async () => {
    if (!token) return
    setJoining(true)
    try {
      await apiClient('/api/users/me', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ marketingAccess: 'waitlisted' }),
      })
      setStoredMarketingAccess('waitlisted')
      addToast({ variant: 'success', title: "You're on the list" })
    } catch {
      addToast({ variant: 'error', title: 'Could not join the waitlist', description: 'Please try again.' })
    } finally {
      setJoining(false)
    }
  }, [token, addToast])

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-4 md:p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Send className="w-6 h-6 text-indigo-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Zuri Marketing is rolling out</h2>
          <p className="text-sm text-gray-500 leading-relaxed max-w-md mx-auto mb-6">
            One product in, a full sales funnel out — AI product descriptions, images and video
            scripts, one-click posting to Facebook, Instagram and TikTok, and every lead landing in
            the same contact list you already use for WhatsApp. Existing customers get first access
            as it opens up.
          </p>

          {waitlisted ? (
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium">
              <Check className="w-4 h-4" />
              You're on the waitlist — we'll email you when Studio opens
            </div>
          ) : (
            <Button onClick={joinWaitlist} loading={joining}>
              <Send className="w-4 h-4" />
              Join the waitlist
            </Button>
          )}

          <div className="mt-6">
            <Link href="/marketing" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
              See what Zuri Marketing does →
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Products section (marketing_access = beta | enabled) ────────────────────

function AddProductForm({ onAdded }: { onAdded: () => void }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = useCallback(async () => {
    if (!token || !name.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/products', {
        method: 'POST',
        token,
        body: JSON.stringify({
          name: name.trim(),
          price: price ? Number(price) : undefined,
        }),
      })
      setName('')
      setPrice('')
      onAdded()
    } catch {
      addToast({ variant: 'error', title: 'Failed to add product', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }, [token, name, price, onAdded, addToast])

  return (
    <div className="flex flex-col sm:flex-row gap-2 p-4 rounded-xl border border-gray-200 bg-gray-50">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Product name"
        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Price (optional)"
        inputMode="decimal"
        className="w-full sm:w-36 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <Button onClick={submit} loading={saving} disabled={!name.trim()}>
        Add
      </Button>
    </div>
  )
}

function ComingSoonCard({ icon: Icon, title, description }: { icon: React.FC<{ className?: string }>; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 opacity-70">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          Coming soon
        </span>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  )
}

function StudioHub() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<{ products: Product[] }>('/api/products', token)
  const products = data?.products ?? []

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Products</h2>
          <div className="space-y-3">
            <AddProductForm onAdded={refetch} />

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 2 }, (_, i) => <SkeletonCard key={i} />)}
              </div>
            ) : products.length === 0 ? (
              <EmptyState
                icon="📦"
                title="No products yet"
                description="Add your first product to start generating content for it."
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products.map((p) => (
                  <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                    {p.price !== null && (
                      <p className="text-xs text-gray-500 mt-1">{p.currency} {p.price.toLocaleString()}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Coming to Studio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComingSoonCard
              icon={Sparkles}
              title="AI Content Generator"
              description="Turn a product into descriptions, image sets and video scripts in one pass."
            />
            <ComingSoonCard
              icon={Radio}
              title="Scheduled Posts"
              description="Queue posts across Facebook, Instagram and TikTok and track what's live."
            />
            <ComingSoonCard
              icon={Link2}
              title="Connected Accounts"
              description="Link your social accounts from Settings once publishing is live."
            />
          </div>
        </section>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const session = useZuriSession()
  const marketingAccess = session.data?.marketingAccess ?? 'none'
  const isLoading = session.status === 'loading'

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="Studio" />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto w-full content-start">
          {Array.from({ length: 2 }, (_, i) => <SkeletonCard key={i} />)}
        </div>
      </div>
    )
  }

  const hasAccess = marketingAccess === 'beta' || marketingAccess === 'enabled'

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Studio"
        description={hasAccess ? 'Zuri Marketing' : undefined}
      />
      {hasAccess ? <StudioHub /> : <WaitlistPitch waitlisted={marketingAccess === 'waitlisted'} />}
    </div>
  )
}
