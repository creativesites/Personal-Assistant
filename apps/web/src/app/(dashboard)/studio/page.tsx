'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { Sparkles, Link2, ChevronDown, ChevronUp, Copy, X, BarChart3, Settings2, Users, ChevronRight, Store, RefreshCw } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
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
  serialNumber: string | null
  whatsappCatalogProductId: string | null
  whatsappCatalogStatus: string
  whatsappCatalogError: string | null
  linkedContacts?: number
  attributedLeads?: number
  createdAt: string
}

interface WhatsAppCatalogProduct {
  id: string | null
  name: string
  description: string | null
  price: number | null
  currency: string | null
  retailerId: string | null
  availability: string | null
  imageUrls: string[]
  reviewStatus: Record<string, string> | null
}

interface ProductContact {
  id: string
  contactId: string
  contactName: string
  phone: string | null
  customerStatus: string | null
  pipelineStage: string | null
  leadScore: number | null
  relationType: string
  quantity: number | null
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

// ─── Products section ─────────────────────────────────────────────────────────

function AddProductForm({ onAdded }: { onAdded: () => void }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [currency, setCurrency] = useState('ZMW')
  const [quantity, setQuantity] = useState('1')
  const [serialNumber, setSerialNumber] = useState('')
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
          description: description.trim() || undefined,
          price: price ? Number(price) : undefined,
          currency: currency.trim() || 'ZMW',
          quantity: quantity ? Number(quantity) : undefined,
          serialNumber: serialNumber.trim() || undefined,
        }),
      })
      setName('')
      setDescription('')
      setPrice('')
      setCurrency('ZMW')
      setQuantity('1')
      setSerialNumber('')
      onAdded()
      addToast({ variant: 'success', title: 'Product added' })
    } catch {
      addToast({ variant: 'error', title: 'Failed to add product', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }, [token, name, description, price, currency, quantity, serialNumber, onAdded, addToast])

  return (
    <div className="space-y-2 p-4 rounded-xl border border-gray-200 bg-gray-50">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_92px] gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Product name"
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Price"
          inputMode="decimal"
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="ZMW"
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description for CRM, content generation and WhatsApp catalog"
        rows={2}
        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr_auto] gap-2">
        <input
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          inputMode="numeric"
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
          placeholder="SKU / retailer ID"
          className="px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <Button onClick={submit} loading={saving} disabled={!name.trim()}>
          Add product
        </Button>
      </div>
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

function ProductCard({ product, onChanged }: { product: Product; onChanged: () => void }) {
  const { addToast } = useToast()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [expanded, setExpanded] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [syncingCatalog, setSyncingCatalog] = useState(false)
  const { data, loading, refetch } = useApi<{ generations: Generation[] }>(
    expanded ? `/api/products/${product.id}/generations` : null,
    token,
  )
  const { data: contactsData, loading: contactsLoading } = useApi<{ contacts: ProductContact[] }>(
    expanded ? `/api/products/${product.id}/contacts` : null,
    token,
  )
  const generations = data?.generations ?? []
  const contacts = contactsData?.contacts ?? []

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

  const addToWhatsAppCatalog = useCallback(async () => {
    if (!token) return
    setSyncingCatalog(true)
    try {
      await apiClient(`/api/products/${product.id}/whatsapp-catalog`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Added to WhatsApp catalog' })
      onChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'This requires a connected WhatsApp Business account.'
      addToast({ variant: 'error', title: 'WhatsApp catalog sync failed', description: message })
      onChanged()
    } finally {
      setSyncingCatalog(false)
    }
  }, [token, product.id, onChanged, addToast])

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
          {product.price !== null && (
            <p className="text-xs text-gray-500 mt-1">{product.currency} {product.price.toLocaleString()}</p>
          )}
          {product.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant={product.whatsappCatalogStatus === 'synced' ? 'success' : product.whatsappCatalogStatus === 'failed' ? 'error' : 'default'}>
              WA {product.whatsappCatalogStatus.replace(/_/g, ' ')}
            </Badge>
            {(product.linkedContacts ?? 0) > 0 && <Badge variant="info">{product.linkedContacts} CRM</Badge>}
            {(product.attributedLeads ?? 0) > 0 && <Badge variant="purple">{product.attributedLeads} leads</Badge>}
          </div>
          {product.whatsappCatalogError && <p className="text-[11px] text-red-500 mt-1">{product.whatsappCatalogError}</p>}
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
          <Button
            size="sm"
            variant="secondary"
            onClick={addToWhatsAppCatalog}
            loading={syncingCatalog}
            disabled={product.price === null}
            className="w-full"
          >
            <Store className="w-3.5 h-3.5" />
            {product.whatsappCatalogProductId ? 'Re-sync WhatsApp catalog' : 'Add to WhatsApp catalog'}
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

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-700">CRM links</p>
              <Link href="/contacts" className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700">
                Manage contacts
              </Link>
            </div>
            {contactsLoading ? (
              <div className="h-8 rounded-md bg-gray-200 animate-pulse" />
            ) : contacts.length > 0 ? (
              <div className="space-y-1.5">
                {contacts.slice(0, 4).map((contact) => (
                  <Link
                    key={contact.id}
                    href={`/contacts/${contact.contactId}`}
                    className="flex items-center justify-between gap-2 rounded-md bg-white border border-gray-100 px-2 py-1.5 hover:border-indigo-200 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-gray-800 truncate">{contact.contactName}</span>
                      <span className="block text-[10px] text-gray-400 capitalize">{contact.relationType.replace(/_/g, ' ')}</span>
                    </span>
                    {contact.leadScore != null && (
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 rounded-full px-1.5 py-0.5">
                        {contact.leadScore}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No CRM contacts linked yet. Zuri will also link products automatically when chats mention matching catalog items.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function WhatsAppCatalogSection() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, error, refetch } = useApi<{ products: WhatsAppCatalogProduct[] }>('/api/whatsapp/catalog/products?limit=20', token)
  const products = data?.products ?? []

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">WhatsApp Business Catalog</h2>
        <button onClick={refetch} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>
      {loading ? (
        <SkeletonCard />
      ) : error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-700">
          Connect a WhatsApp Business account to list catalog products here.
        </div>
      ) : products.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-2">No WhatsApp catalog products found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {products.map((p, index) => (
            <div key={p.id ?? index} className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
              {p.price !== null && <p className="text-xs text-gray-500 mt-1">{p.currency} {p.price.toLocaleString()}</p>}
              {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
              {p.retailerId && <p className="text-[10px] text-gray-400 mt-2">Retailer ID: {p.retailerId}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
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

function ActionLink({ href, icon: Icon, title, description }: { href: string; icon: React.FC<{ className?: string }>; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 group-hover:text-indigo-400 transition-colors" />
    </Link>
  )
}

interface CampaignsSummary {
  postsSent: number
  totalLeads: number
  totalSales: number
}

function StudioOverview({ productCount }: { productCount: number }) {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data: campaigns } = useApi<{ summary: CampaignsSummary }>('/api/analytics/campaigns', token)
  const { data: accountsData } = useApi<{ accounts: SocialAccount[] }>('/api/social-accounts', token)
  const summary = campaigns?.summary
  const connectedAccounts = accountsData?.accounts.length ?? 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
      <div>
        <p className="text-xl font-bold text-gray-900 tabular-nums">{productCount}</p>
        <p className="text-xs text-gray-500 mt-0.5">Products</p>
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 tabular-nums">{connectedAccounts}</p>
        <p className="text-xs text-gray-500 mt-0.5">Connected accounts</p>
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 tabular-nums">{summary?.totalLeads ?? 0}</p>
        <p className="text-xs text-gray-500 mt-0.5">Leads from social</p>
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 tabular-nums">{summary?.totalSales ?? 0}</p>
        <p className="text-xs text-gray-500 mt-0.5">Sales attributed</p>
      </div>
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
        <StudioOverview productCount={products.length} />

        <div className="flex items-start gap-3 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
          <Users className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-indigo-700 leading-relaxed">
            Leads from these posts land in the same <Link href="/contacts" className="font-semibold underline hover:no-underline">Contacts</Link> list
            you already use for WhatsApp — one CRM, not two.
          </p>
        </div>

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
                {products.map((p) => <ProductCard key={p.id} product={p} onChanged={refetch} />)}
              </div>
            )}
          </div>
        </section>

        <WhatsAppCatalogSection />

        <ScheduledPostsSection products={products} />

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ActionLink href="/analytics/campaigns" icon={BarChart3} title="Campaign analytics" description="Full funnel: best posts, conversion rate, recommendations" />
            <ActionLink href="/settings" icon={Settings2} title="Connected accounts" description="Manage Facebook, Instagram and TikTok connections" />
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Coming to Studio</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Studio" description="Zuri Marketing" />
      <StudioHub />
    </div>
  )
}
