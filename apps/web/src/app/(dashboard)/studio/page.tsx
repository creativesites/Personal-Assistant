'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Send, Sparkles, Radio, Link2, Check, ChevronDown, ChevronUp, Copy, X } from 'lucide-react'
import { useZuriSession, setStoredMarketingAccess } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Badge, Button, EmptyState, PageHeader, SkeletonCard, useToast } from '@/components/ui'

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

interface Generation {
  id: string
  contentType: string
  output: string
  model: string
  createdAt: string
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  description: 'Product description',
  caption: 'Social caption',
  video_script: 'Video script',
}

interface SocialAccount {
  id: string
  platform: string
  accountName: string | null
  status: string
}

interface SocialPost {
  id: string
  productName: string | null
  platform: string
  accountName: string | null
  caption: string
  status: string
  scheduledAt: string | null
  errorMessage: string | null
  createdAt: string
}

const POST_STATUS_BADGE: Record<string, 'default' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'default',
  scheduled: 'info',
  sending: 'warning',
  sent: 'success',
  failed: 'error',
  cancelled: 'default',
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

function GeneratedContentCard({ generation }: { generation: Generation }) {
  const { addToast } = useToast()
  const copy = useCallback(() => {
    navigator.clipboard.writeText(generation.output).then(() => {
      addToast({ variant: 'success', title: 'Copied' })
    })
  }, [generation.output, addToast])

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-gray-700">{CONTENT_TYPE_LABELS[generation.contentType] ?? generation.contentType}</p>
        <button onClick={copy} className="text-gray-400 hover:text-indigo-600 transition-colors" aria-label="Copy">
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{generation.output}</p>
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const { data, loading, refetch } = useApi<{ generations: Generation[] }>(
    expanded ? `/api/products/${product.id}/generations` : null,
    token,
  )
  const generations = data?.generations ?? []

  const generate = useCallback(async () => {
    if (!token) return
    setGenerating(true)
    setExpanded(true)
    try {
      await apiClient(`/api/products/${product.id}/generate`, { method: 'POST', token })
      refetch()
    } catch {
      addToast({ variant: 'error', title: 'Failed to generate content', description: 'Please try again.' })
    } finally {
      setGenerating(false)
    }
  }, [token, product.id, refetch, addToast])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
          {product.price !== null && (
            <p className="text-xs text-gray-500 mt-1">{product.currency} {product.price.toLocaleString()}</p>
          )}
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <Button size="sm" variant="secondary" onClick={generate} loading={generating} className="w-full">
            <Sparkles className="w-3.5 h-3.5" />
            {generations.length > 0 ? 'Regenerate content' : 'Generate content'}
          </Button>

          {loading && !generating ? (
            <SkeletonCard />
          ) : generations.length > 0 ? (
            <div className="space-y-2">
              {generations.map((g) => <GeneratedContentCard key={g.id} generation={g} />)}
            </div>
          ) : !generating ? (
            <p className="text-xs text-gray-400 text-center py-2">No content generated yet.</p>
          ) : null}
        </div>
      )}
    </div>
  )
}

function PostComposer({ products, accounts, onCreated }: { products: Product[]; accounts: SocialAccount[]; onCreated: () => void }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [productId, setProductId] = useState('')
  const [socialAccountId, setSocialAccountId] = useState(accounts[0]?.id ?? '')
  const [caption, setCaption] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = useCallback(async () => {
    if (!token || !socialAccountId || !caption.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/social-posts', {
        method: 'POST',
        token,
        body: JSON.stringify({
          productId: productId || undefined,
          socialAccountId,
          caption: caption.trim(),
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : new Date().toISOString(),
        }),
      })
      setCaption('')
      setScheduledAt('')
      onCreated()
      addToast({ variant: 'success', title: 'Post scheduled' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to schedule post', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }, [token, productId, socialAccountId, caption, scheduledAt, onCreated, addToast])

  if (accounts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        Connect a social account in <Link href="/settings" className="text-indigo-600 hover:text-indigo-700 font-medium">Settings</Link> before scheduling a post.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">No product</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={socialAccountId}
          onChange={(e) => setSocialAccountId(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.platform} — {a.accountName}</option>)}
        </select>
      </div>
      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        placeholder="Caption"
        rows={2}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Button onClick={submit} loading={saving} disabled={!socialAccountId || !caption.trim()}>
          {scheduledAt ? 'Schedule post' : 'Post now'}
        </Button>
      </div>
    </div>
  )
}

function SocialPostRow({ post, onCancelled }: { post: SocialPost; onCancelled: () => void }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [cancelling, setCancelling] = useState(false)

  const cancel = useCallback(async () => {
    if (!token) return
    setCancelling(true)
    try {
      await apiClient(`/api/social-posts/${post.id}/cancel`, { method: 'POST', token })
      onCancelled()
    } catch {
      addToast({ variant: 'error', title: 'Failed to cancel post' })
    } finally {
      setCancelling(false)
    }
  }, [token, post.id, onCancelled, addToast])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={POST_STATUS_BADGE[post.status] ?? 'default'}>{post.status}</Badge>
            <span className="text-xs text-gray-400 capitalize">{post.platform}{post.productName ? ` · ${post.productName}` : ''}</span>
          </div>
          <p className="text-xs text-gray-600 truncate">{post.caption}</p>
          {post.errorMessage && <p className="text-xs text-red-500 mt-1">{post.errorMessage}</p>}
        </div>
        {['draft', 'scheduled'].includes(post.status) && (
          <button onClick={cancel} disabled={cancelling} className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0" aria-label="Cancel">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function ScheduledPostsSection({ products }: { products: Product[] }) {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data: accountsData, loading: accountsLoading } = useApi<{ accounts: SocialAccount[] }>('/api/social-accounts', token)
  const { data: postsData, loading: postsLoading, refetch } = useApi<{ posts: SocialPost[] }>('/api/social-posts', token)
  const accounts = accountsData?.accounts ?? []
  const posts = postsData?.posts ?? []

  return (
    <section>
      <h2 className="text-sm font-semibold text-gray-900 mb-3">Scheduled Posts</h2>
      <div className="space-y-3">
        {accountsLoading ? <SkeletonCard /> : <PostComposer products={products} accounts={accounts} onCreated={refetch} />}

        {postsLoading ? (
          <SkeletonCard />
        ) : posts.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-2">No posts scheduled yet.</p>
        ) : (
          <div className="space-y-2">
            {posts.map((p) => <SocialPostRow key={p.id} post={p} onCancelled={refetch} />)}
          </div>
        )}
      </div>
    </section>
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
                {products.map((p) => <ProductCard key={p.id} product={p} />)}
              </div>
            )}
          </div>
        </section>

        <ScheduledPostsSection products={products} />

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Coming to Studio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ComingSoonCard
              icon={Radio}
              title="Funnel analytics"
              description="See which posts turn into leads and sales, right in Analytics."
            />
            <ComingSoonCard
              icon={Link2}
              title="Real OAuth connections"
              description="Facebook/Instagram/TikTok login instead of manually naming an account."
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
