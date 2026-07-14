'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  Home,
  Package,
  BarChart3,
  DollarSign,
  Truck,
  FileText,
  Palette,
  BookOpen,
  Megaphone,
  Plus,
  ChevronDown,
  ChevronUp,
  Edit2,
  Trash2,
  Send,
  Sparkles,
  Copy,
  RefreshCw,
  AlertTriangle,
  Building2,
  Star,
  Check,
  X,
  TrendingUp,
  Layers,
  MessageSquare,
  ShoppingCart,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

type Module =
  | 'overview'
  | 'catalog'
  | 'inventory'
  | 'pricing'
  | 'suppliers'
  | 'rules'
  | 'brand'
  | 'knowledge'
  | 'marketing'

interface Product {
  id: string
  name: string
  description: string | null
  price: number | null
  currency: string
  quantity: number
  status: string
  itemType: string
  sku: string | null
  barcode: string | null
  category: string | null
  brand: string | null
  stock: number
  available: number
  reserved: number
  minimumStock: number
  maximumStock: number | null
  sellingPrice: number | null
  purchaseCost: number
  margin: number | null
  leadTime: number
  supplierLeadTime: number
  supplierId: string | null
  warranty: string | null
  tags: string[]
  images: string[]
  videos: any[]
  discountRules: any[]
  crossSell: any[]
  upsell: any[]
  serviceDetails: Record<string, any>
  inventoryDetails: Record<string, any>
  pricingDetails: Record<string, any>
  aiNotes: string | null
  marketingCopy: string | null
  whatsappCatalogStatus: string
  whatsappCatalogProductId: string | null
  linkedContacts: number
  attributedLeads: number
  createdAt: string
  updatedAt: string
}

interface Supplier {
  id: string
  company: string
  contact: string | null
  phone: string | null
  whatsapp: string | null
  email: string | null
  averageDeliveryTime: number
  reliabilityScore: number
  minimumOrder: number
  paymentTerms: string | null
  outstandingBalance: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

interface BusinessFact {
  id: string
  category: string
  factKey: string
  factValue: string
  isApproved: boolean
  isActive: boolean
  createdAt: string
}

interface AdvisorSession {
  id: string
  title: string
  category: string
  createdAt: string
}

interface AdvisorMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

interface BusinessProfile {
  id: string
  business_name: string | null
  tagline: string | null
  industry: string | null
  logo_url: string | null
  primary_color: string | null
  secondary_color: string | null
  accent_color: string | null
  brand_voice: string | null
  company_values: string | null
}

interface KBDocument {
  id: string
  title: string
  type: string
  createdAt: string
}

interface Generation {
  id: string
  content: string
  type: string
  createdAt: string
}

interface SocialPost {
  id: string
  content: string
  platform: string
  status: string
  createdAt: string
}

interface SocialAccount {
  id: string
  platform: string
  username: string
  connected: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function marginColor(pct: number): string {
  if (pct < 15) return 'text-red-600'
  if (pct < 30) return 'text-amber-600'
  return 'text-green-600'
}

function stockVariant(available: number, min: number): 'error' | 'warning' | 'success' {
  if (available <= min) return 'error'
  if (available <= min * 2) return 'warning'
  return 'success'
}

function reliabilityVariant(score: number): 'error' | 'warning' | 'success' {
  if (score < 70) return 'error'
  if (score < 85) return 'warning'
  return 'success'
}

function itemTypeBadgeVariant(type: string): 'default' | 'info' | 'success' | 'purple' | 'warning' {
  switch (type) {
    case 'product': return 'info'
    case 'service': return 'success'
    case 'bundle': return 'purple'
    case 'subscription': return 'warning'
    case 'digital_product': return 'default'
    default: return 'default'
  }
}

function formatCurrency(amount: number | null | undefined, currency = 'USD'): string {
  if (amount == null) return '—'
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

function calcMargin(selling: number | null, cost: number): number | null {
  if (!selling || selling === 0) return null
  return ((selling - cost) / selling) * 100
}

// ─── Tab Config ───────────────────────────────────────────────────────────────

const MODULES: { id: Module; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview',   label: 'Overview',   Icon: Home },
  { id: 'catalog',    label: 'Catalog',    Icon: ShoppingCart },
  { id: 'inventory',  label: 'Inventory',  Icon: Package },
  { id: 'pricing',    label: 'Pricing',    Icon: DollarSign },
  { id: 'suppliers',  label: 'Suppliers',  Icon: Truck },
  { id: 'rules',      label: 'Rules',      Icon: FileText },
  { id: 'brand',      label: 'Brand',      Icon: Palette },
  { id: 'knowledge',  label: 'Knowledge',  Icon: BookOpen },
  { id: 'marketing',  label: 'Marketing',  Icon: Megaphone },
]

// ─── Overview Module ──────────────────────────────────────────────────────────

function OverviewModule({ token }: { token: string | undefined }) {
  const { data: productsData, loading: productsLoading } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: suppliersData, loading: suppliersLoading } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { data: rulesData, loading: rulesLoading } = useApi<{ facts: BusinessFact[] }>(
    token ? '/api/business-facts?category=business_rule' : null, token,
  )

  const products  = productsData?.products  ?? []
  const suppliers = suppliersData?.suppliers ?? []
  const rules     = rulesData?.facts        ?? []

  const totalItems = products.length
  const lowStock   = products.filter(p => p.available <= p.minimumStock).length

  // ── Advisor chat ──
  const [sessionId,      setSessionId]      = useState<string | null>(null)
  const [messages,       setMessages]       = useState<AdvisorMessage[]>([])
  const [sessionLoading, setSessionLoading] = useState(false)
  const [typing,         setTyping]         = useState(false)
  const [input,          setInput]          = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const { addToast } = useToast()

  const SUGGESTED = [
    "What's my current stock situation?",
    'Which products have the best margin?',
    'Are any items below reorder point?',
    'What suppliers are most reliable?',
  ]

  useEffect(() => {
    if (!token) return
    setSessionLoading(true)
    apiClient<{ sessions: AdvisorSession[] }>('/api/advisor/sessions?category=business', { token })
      .then(async res => {
        let sid: string
        if (res.sessions && res.sessions.length > 0) {
          sid = res.sessions[0].id
        } else {
          const created = await apiClient<{ session: AdvisorSession }>('/api/advisor/sessions', {
            method: 'POST', token,
            body: JSON.stringify({ title: 'Business Advisor', category: 'business' }),
          })
          sid = created.session.id
        }
        setSessionId(sid)
        const msgs = await apiClient<{ messages: AdvisorMessage[] }>(
          `/api/advisor/sessions/${sid}/messages`, { token },
        )
        setMessages(msgs.messages ?? [])
      })
      .catch(() => addToast({ variant: 'error', title: 'Could not load advisor session' }))
      .finally(() => setSessionLoading(false))
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  async function sendMessage(text: string) {
    if (!text.trim() || !sessionId || !token) return
    const userMsg: AdvisorMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text.trim(),
      createdAt: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setTyping(true)
    try {
      const res = await apiClient<{ message: AdvisorMessage }>(
        `/api/advisor/sessions/${sessionId}/messages`,
        { method: 'POST', token, body: JSON.stringify({ message: text.trim() }) },
      )
      setMessages(prev => [...prev, res.message])
    } catch {
      addToast({ variant: 'error', title: 'Failed to send message' })
    } finally {
      setTyping(false)
    }
  }

  const statsLoading = productsLoading || suppliersLoading || rulesLoading

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {statsLoading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : ([
              { label: 'Total Items',     value: totalItems,                               Icon: Package,       color: 'text-indigo-600' },
              { label: 'Low Stock',       value: lowStock,                                 Icon: AlertTriangle, color: lowStock > 0 ? 'text-red-600' : 'text-green-600' },
              { label: 'Suppliers',       value: suppliers.length,                         Icon: Truck,         color: 'text-blue-600' },
              { label: 'Business Rules',  value: rules.filter(r => r.isActive).length,     Icon: FileText,      color: 'text-purple-600' },
            ] as const).map(({ label, value, Icon, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">{label}</p>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))
        }
      </div>

      {/* AI Business Advisor Chat */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col" style={{ height: '520px' }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <Sparkles className="w-4 h-4 text-indigo-600" />
          <span className="font-semibold text-gray-900 text-sm">AI Business Advisor</span>
        </div>

        {sessionLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && !typing && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 text-center pt-4">Ask your Business Advisor anything</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTED.map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="text-left text-xs text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 rounded-lg p-3 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-indigo-100 text-gray-900'
                        : 'bg-white border border-gray-200 text-gray-800'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                    <span className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <span
                          key={d}
                          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-gray-100 px-4 py-3">
              <form onSubmit={e => { e.preventDefault(); sendMessage(input) }} className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about your business..."
                  disabled={typing}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <Button type="submit" disabled={!input.trim() || typing} className="shrink-0">
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Catalog Module ───────────────────────────────────────────────────────────

const CATALOG_FILTER_LIST = ['All', 'product', 'service', 'bundle', 'subscription', 'digital_product'] as const
type CatalogFilter = (typeof CATALOG_FILTER_LIST)[number]

const FILTER_LABELS: Record<string, string> = {
  All: 'All',
  product: 'Products',
  service: 'Services',
  bundle: 'Bundles',
  subscription: 'Subscriptions',
  digital_product: 'Digital',
}

const BLANK_CATALOG_FORM = {
  name: '', itemType: 'product', sku: '', category: '', brand: '',
  description: '', sellingPrice: '', currency: 'USD', stock: '',
  minimumStock: '', purchaseCost: '', supplierId: '', warranty: '', tags: '',
}

function CatalogModule({ token }: { token: string | undefined }) {
  const { data: productsData, loading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: suppliersData } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { addToast } = useToast()

  const products  = productsData?.products  ?? []
  const suppliers = suppliersData?.suppliers ?? []

  const [filter,         setFilter]         = useState<CatalogFilter>('All')
  const [showAdd,        setShowAdd]        = useState(false)
  const [expandedId,     setExpandedId]     = useState<string | null>(null)
  const [deleteConfirm,  setDeleteConfirm]  = useState<string | null>(null)
  const [generatingId,   setGeneratingId]   = useState<string | null>(null)
  const [syncingId,      setSyncingId]      = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [form,           setForm]           = useState({ ...BLANK_CATALOG_FORM })

  const filtered = filter === 'All' ? products : products.filter(p => p.itemType === filter)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/products', {
        method: 'POST', token,
        body: JSON.stringify({
          name:         form.name.trim(),
          itemType:     form.itemType,
          sku:          form.sku          || null,
          category:     form.category     || null,
          brand:        form.brand        || null,
          description:  form.description  || null,
          sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : null,
          currency:     form.currency,
          stock:        form.stock        ? parseInt(form.stock)          : 0,
          minimumStock: form.minimumStock ? parseInt(form.minimumStock)   : 0,
          purchaseCost: form.purchaseCost ? parseFloat(form.purchaseCost) : 0,
          supplierId:   form.supplierId   || null,
          warranty:     form.warranty     || null,
          tags:         form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        }),
      })
      addToast({ variant: 'success', title: 'Item added' })
      setForm({ ...BLANK_CATALOG_FORM })
      setShowAdd(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add item' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/products/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Item deleted' })
      setDeleteConfirm(null)
      setExpandedId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete' })
    }
  }

  async function handleGenerate(id: string) {
    setGeneratingId(id)
    try {
      await apiClient(`/api/products/${id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'AI content generated' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Generation failed' })
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleWASync(id: string) {
    setSyncingId(id)
    try {
      await apiClient(`/api/products/${id}/whatsapp-catalog`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Synced to WhatsApp catalog' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'WA sync failed' })
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs + Add button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 overflow-x-auto pb-1 flex-shrink-0 min-w-0">
          {CATALOG_FILTER_LIST.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-indigo-300'
              }`}
              style={{ minHeight: '36px' }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowAdd(v => !v)} className="shrink-0">
          <Plus className="w-4 h-4 mr-1.5" />
          Add item
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">New Catalog Item</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Product name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={form.itemType}
                onChange={e => setForm(f => ({ ...f, itemType: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="product">Product</option>
                <option value="service">Service</option>
                <option value="bundle">Bundle</option>
                <option value="subscription">Subscription</option>
                <option value="digital_product">Digital Product</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">SKU</label>
              <input
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                placeholder="SKU-001"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <input
                value={form.category}
                onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Electronics, Clothing..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Brand</label>
              <input
                value={form.brand}
                onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                placeholder="Brand name"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Supplier</label>
              <select
                value={form.supplierId}
                onChange={e => setForm(f => ({ ...f, supplierId: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">No supplier</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.company}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Selling Price</label>
              <input
                type="number" min="0" step="0.01"
                value={form.sellingPrice}
                onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Currency</label>
              <input
                value={form.currency}
                onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                placeholder="USD"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Stock</label>
              <input
                type="number" min="0"
                value={form.stock}
                onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Minimum Stock</label>
              <input
                type="number" min="0"
                value={form.minimumStock}
                onChange={e => setForm(f => ({ ...f, minimumStock: e.target.value }))}
                placeholder="0"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Purchase Cost</label>
              <input
                type="number" min="0" step="0.01"
                value={form.purchaseCost}
                onChange={e => setForm(f => ({ ...f, purchaseCost: e.target.value }))}
                placeholder="0.00"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Warranty</label>
              <input
                value={form.warranty}
                onChange={e => setForm(f => ({ ...f, warranty: e.target.value }))}
                placeholder="12 months"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Describe this item..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Tags (comma-separated)</label>
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="tag1, tag2, tag3"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setForm({ ...BLANK_CATALOG_FORM }) }}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              Save Item
            </Button>
          </div>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No catalog items yet"
          description="Add your first product or service to get started."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1.5" />Add item</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(p => {
            const isExpanded = expandedId === p.id
            const sv     = stockVariant(p.available, p.minimumStock)
            const margin = calcMargin(p.sellingPrice, p.purchaseCost)
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                        <Badge variant={itemTypeBadgeVariant(p.itemType)}>
                          {p.itemType.replace('_', ' ')}
                        </Badge>
                      </div>
                      {p.category && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {p.category}{p.brand ? ` · ${p.brand}` : ''}
                        </p>
                      )}
                      {p.sku && <p className="text-xs text-gray-400 mt-0.5">SKU: {p.sku}</p>}
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatCurrency(p.sellingPrice, p.currency)}
                    </span>
                    <Badge variant={sv}>
                      {sv === 'error' ? 'Low stock' : sv === 'warning' ? 'Limited' : 'In stock'} ({p.available})
                    </Badge>
                    {p.whatsappCatalogStatus && (
                      <Badge variant={p.whatsappCatalogStatus === 'synced' ? 'success' : 'default'}>
                        WA: {p.whatsappCatalogStatus}
                      </Badge>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {p.description && <p className="text-sm text-gray-600">{p.description}</p>}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-gray-500">Cost:</span> <span className="font-medium">{formatCurrency(p.purchaseCost, p.currency)}</span></div>
                      <div>
                        <span className="text-gray-500">Margin:</span>{' '}
                        <span className={`font-medium ${margin != null ? marginColor(margin) : ''}`}>
                          {margin != null ? `${margin.toFixed(1)}%` : '—'}
                        </span>
                      </div>
                      <div><span className="text-gray-500">Reserved:</span> <span className="font-medium">{p.reserved}</span></div>
                      <div><span className="text-gray-500">Min stock:</span> <span className="font-medium">{p.minimumStock}</span></div>
                      {p.warranty  && <div><span className="text-gray-500">Warranty:</span> <span className="font-medium">{p.warranty}</span></div>}
                      {p.leadTime > 0 && <div><span className="text-gray-500">Lead time:</span> <span className="font-medium">{p.leadTime}d</span></div>}
                    </div>

                    {p.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {p.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                      </div>
                    )}

                    {p.aiNotes && (
                      <div className="bg-indigo-50 rounded-lg p-3">
                        <p className="text-xs text-indigo-700 font-medium mb-1">AI Notes</p>
                        <p className="text-xs text-indigo-600">{p.aiNotes}</p>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => handleGenerate(p.id)} disabled={generatingId === p.id}>
                        {generatingId === p.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                        Generate AI content
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleWASync(p.id)} disabled={syncingId === p.id}>
                        {syncingId === p.id
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                          : <MessageSquare className="w-3.5 h-3.5 mr-1" />}
                        Sync to WA catalog
                      </Button>
                      {deleteConfirm === p.id ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500">Delete?</span>
                          <button onClick={() => handleDelete(p.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 hover:underline">No</button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setDeleteConfirm(p.id)}>
                          <Trash2 className="w-3.5 h-3.5 mr-1 text-red-500" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Inventory Module ─────────────────────────────────────────────────────────

function InventoryModule({ token }: { token: string | undefined }) {
  const { data: productsData, loading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { addToast } = useToast()
  const products = productsData?.products ?? []

  const [editStockId, setEditStockId] = useState<string | null>(null)
  const [stockInput,  setStockInput]  = useState('')
  const [savingId,    setSavingId]    = useState<string | null>(null)

  const sorted = [...products].sort((a, b) => {
    const aLow = a.available <= a.minimumStock
    const bLow = b.available <= b.minimumStock
    if (aLow && !bLow) return -1
    if (!aLow && bLow) return 1
    return a.available - b.available
  })

  const totalSKUs   = products.length
  const inStock     = products.filter(p => p.available > p.minimumStock).length
  const lowStock    = products.filter(p => p.available <= p.minimumStock && p.available > 0).length
  const outOfStock  = products.filter(p => p.available === 0).length

  async function saveStock(id: string) {
    const val = parseInt(stockInput)
    if (isNaN(val) || val < 0) return
    setSavingId(id)
    try {
      await apiClient(`/api/products/${id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ stock: val }),
      })
      addToast({ variant: 'success', title: 'Stock updated' })
      setEditStockId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to update stock' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total SKUs',    value: totalSKUs,   color: 'text-gray-900'   },
          { label: 'In Stock',      value: inStock,     color: 'text-green-600'  },
          { label: 'Low Stock',     value: lowStock,    color: 'text-amber-600'  },
          { label: 'Out of Stock',  value: outOfStock,  color: 'text-red-600'    },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 text-center">
            <p className="text-xs text-gray-500">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState title="No inventory items" description="Add products to your catalog to track inventory." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sorted.map(p => {
            const sv       = stockVariant(p.available, p.minimumStock)
            const pct      = p.stock > 0 ? Math.min(100, (p.available / p.stock) * 100) : 0
            const barColor = sv === 'error' ? 'bg-red-500' : sv === 'warning' ? 'bg-amber-500' : 'bg-green-500'
            return (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{p.name}</p>
                    {p.category && (
                      <p className="text-xs text-gray-500">{p.category}{p.brand ? ` · ${p.brand}` : ''}</p>
                    )}
                  </div>
                  <Badge variant={sv}>{sv === 'error' ? 'Low' : sv === 'warning' ? 'Limited' : 'OK'}</Badge>
                </div>

                <div className="flex items-center gap-3 mb-2">
                  {editStockId === p.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min="0"
                        value={stockInput}
                        onChange={e => setStockInput(e.target.value)}
                        className="w-20 rounded-lg border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoFocus
                      />
                      <button
                        onClick={() => saveStock(p.id)}
                        disabled={savingId === p.id}
                        className="text-xs text-indigo-600 font-medium hover:underline disabled:opacity-50"
                      >
                        {savingId === p.id ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditStockId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditStockId(p.id); setStockInput(p.available.toString()) }}
                      className="text-2xl font-bold text-gray-900 hover:text-indigo-600 transition-colors"
                      title="Click to update stock"
                    >
                      {p.available}
                    </button>
                  )}
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>reserved: {p.reserved}</div>
                    <div>reorder at: {p.minimumStock}</div>
                  </div>
                </div>

                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{p.available} available of {p.stock} total</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Pricing Module ───────────────────────────────────────────────────────────

function PricingModule({ token }: { token: string | undefined }) {
  const { data: productsData, loading: productsLoading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: pricingRulesData, loading: rulesLoading } = useApi<{ facts: BusinessFact[] }>(
    token ? '/api/business-facts?category=pricing' : null, token,
  )
  const { addToast } = useToast()

  const products     = productsData?.products   ?? []
  const pricingRules = pricingRulesData?.facts  ?? []

  const [editPriceId, setEditPriceId] = useState<string | null>(null)
  const [priceInput,  setPriceInput]  = useState('')
  const [savingId,    setSavingId]    = useState<string | null>(null)

  async function savePrice(id: string) {
    const val = parseFloat(priceInput)
    if (isNaN(val) || val < 0) return
    setSavingId(id)
    try {
      await apiClient(`/api/products/${id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ sellingPrice: val }),
      })
      addToast({ variant: 'success', title: 'Price updated' })
      setEditPriceId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to update price' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {productsLoading ? (
        <SkeletonCard />
      ) : products.length === 0 ? (
        <EmptyState title="No products to price" description="Add items to your catalog first." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Cost', 'Selling Price', 'Margin %', 'Margin Value', 'Edit'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const margin      = calcMargin(p.sellingPrice, p.purchaseCost)
                  const marginValue = p.sellingPrice != null ? p.sellingPrice - p.purchaseCost : null
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(p.purchaseCost, p.currency)}</td>
                      <td className="px-4 py-3">
                        {editPriceId === p.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number" min="0" step="0.01"
                              value={priceInput}
                              onChange={e => setPriceInput(e.target.value)}
                              className="w-24 rounded-lg border border-indigo-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              autoFocus
                            />
                            <button onClick={() => savePrice(p.id)} disabled={savingId === p.id} className="text-xs text-indigo-600 font-medium hover:underline">
                              {savingId === p.id ? '...' : 'Save'}
                            </button>
                            <button onClick={() => setEditPriceId(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditPriceId(p.id); setPriceInput((p.sellingPrice ?? 0).toString()) }}
                            className="font-medium text-gray-900 hover:text-indigo-600 transition-colors flex items-center gap-1"
                          >
                            {formatCurrency(p.sellingPrice, p.currency)}
                            <Edit2 className="w-3 h-3 opacity-40" />
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {margin != null
                          ? <span className={`font-semibold ${marginColor(margin)}`}>{margin.toFixed(1)}%</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {marginValue != null ? formatCurrency(marginValue, p.currency) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setEditPriceId(p.id); setPriceInput((p.sellingPrice ?? 0).toString()) }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pricing Rules */}
      {!rulesLoading && pricingRules.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            Pricing Rules &amp; Benchmarks
          </h3>
          <div className="space-y-2">
            {pricingRules.map(rule => (
              <div key={rule.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700">
                <span className="font-medium text-gray-500 text-xs">{rule.factKey}:</span> {rule.factValue}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Suppliers Module ─────────────────────────────────────────────────────────

const BLANK_SUPPLIER_FORM = {
  company: '', contact: '', phone: '', whatsapp: '', email: '',
  averageDeliveryTime: '', reliabilityScore: '', minimumOrder: '',
  paymentTerms: '', notes: '',
}

function SuppliersModule({ token }: { token: string | undefined }) {
  const { data: suppliersData, loading, refetch } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { addToast } = useToast()
  const suppliers = suppliersData?.suppliers ?? []

  const [showAdd,       setShowAdd]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [form,          setForm]          = useState({ ...BLANK_SUPPLIER_FORM })

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/suppliers', {
        method: 'POST', token,
        body: JSON.stringify({
          company:             form.company.trim(),
          contact:             form.contact             || null,
          phone:               form.phone               || null,
          whatsapp:            form.whatsapp            || null,
          email:               form.email               || null,
          averageDeliveryTime: form.averageDeliveryTime ? parseInt(form.averageDeliveryTime)   : 0,
          reliabilityScore:    form.reliabilityScore    ? parseFloat(form.reliabilityScore)    : 100,
          minimumOrder:        form.minimumOrder        ? parseFloat(form.minimumOrder)        : 0,
          paymentTerms:        form.paymentTerms        || null,
          notes:               form.notes               || null,
        }),
      })
      addToast({ variant: 'success', title: 'Supplier added' })
      setForm({ ...BLANK_SUPPLIER_FORM })
      setShowAdd(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add supplier' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/suppliers/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Supplier removed' })
      setDeleteConfirm(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete supplier' })
    }
  }

  const SUPPLIER_FIELDS: { key: keyof typeof BLANK_SUPPLIER_FORM; label: string; placeholder: string; type?: string }[] = [
    { key: 'company',             label: 'Company *',                   placeholder: 'Acme Corp'    },
    { key: 'contact',             label: 'Contact name',                placeholder: 'John Doe'     },
    { key: 'phone',               label: 'Phone',                       placeholder: '+1 555 0100'  },
    { key: 'whatsapp',            label: 'WhatsApp',                    placeholder: '+1 555 0100'  },
    { key: 'email',               label: 'Email',                       placeholder: 'contact@acme.com' },
    { key: 'averageDeliveryTime', label: 'Avg delivery (days)',          placeholder: '7',   type: 'number' },
    { key: 'reliabilityScore',    label: 'Reliability score (0–100)',    placeholder: '95',  type: 'number' },
    { key: 'minimumOrder',        label: 'Minimum order ($)',            placeholder: '100', type: 'number' },
    { key: 'paymentTerms',        label: 'Payment terms',               placeholder: 'Net 30' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(v => !v)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add supplier
        </Button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 space-y-4">
          <p className="font-semibold text-gray-900 text-sm">New Supplier</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SUPPLIER_FIELDS.map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <input
                  type={type ?? 'text'}
                  required={key === 'company'}
                  value={form[key]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional notes..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setForm({ ...BLANK_SUPPLIER_FORM }) }}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              Save supplier
            </Button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : suppliers.length === 0 ? (
        <EmptyState
          title="No suppliers yet"
          description="Add vendors to track delivery times and balances."
          action={<Button onClick={() => setShowAdd(true)}><Plus className="w-4 h-4 mr-1.5" />Add supplier</Button>}
        />
      ) : (
        <div className="space-y-3">
          {suppliers.map(s => {
            const rv = reliabilityVariant(s.reliabilityScore)
            return (
              <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{s.company}</p>
                      <Badge variant={rv}>Reliability: {s.reliabilityScore}/100</Badge>
                    </div>
                    {s.contact && <p className="text-sm text-gray-600 mt-1">{s.contact}</p>}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 text-xs">
                      <div>
                        <p className="text-gray-400">Delivery time</p>
                        <p className="font-medium text-gray-700">{s.averageDeliveryTime}d avg</p>
                      </div>
                      {s.paymentTerms && (
                        <div>
                          <p className="text-gray-400">Payment terms</p>
                          <p className="font-medium text-gray-700">{s.paymentTerms}</p>
                        </div>
                      )}
                      {s.minimumOrder > 0 && (
                        <div>
                          <p className="text-gray-400">Min order</p>
                          <p className="font-medium text-gray-700">${s.minimumOrder}</p>
                        </div>
                      )}
                      {s.outstandingBalance > 0 && (
                        <div>
                          <p className="text-gray-400">Outstanding</p>
                          <p className="font-medium text-red-600">${s.outstandingBalance}</p>
                        </div>
                      )}
                    </div>
                    {s.notes && <p className="text-xs text-gray-500 mt-2 italic">{s.notes}</p>}
                  </div>
                  <div className="shrink-0">
                    {deleteConfirm === s.id ? (
                      <div className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-500">Delete?</span>
                        <button onClick={() => handleDelete(s.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                        <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 hover:underline">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(s.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Rules Module ─────────────────────────────────────────────────────────────

function RulesModule({ token }: { token: string | undefined }) {
  const { data: rulesData, loading, refetch } = useApi<{ facts: BusinessFact[] }>(
    token ? '/api/business-facts?category=business_rule' : null, token,
  )
  const { addToast } = useToast()
  const rules = (rulesData?.facts ?? []).filter(f => f.isActive)

  const [ruleText,      setRuleText]      = useState('')
  const [saving,        setSaving]        = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!ruleText.trim()) return
    setSaving(true)
    try {
      await apiClient('/api/business-facts', {
        method: 'POST', token,
        body: JSON.stringify({ category: 'business_rule', factKey: 'Rule', factValue: ruleText.trim() }),
      })
      addToast({ variant: 'success', title: 'Rule added' })
      setRuleText('')
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add rule' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiClient(`/api/business-facts/${id}`, { method: 'DELETE', token })
      addToast({ variant: 'success', title: 'Rule deleted' })
      setDeleteConfirm(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete rule' })
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <p className="text-sm text-indigo-700">
          These rules guide Zuri&apos;s AI when generating WhatsApp reply suggestions. Be specific about your policies, pricing practices, and business norms.
        </p>
      </div>

      <form onSubmit={handleAdd} className="flex gap-2 items-end">
        <div className="flex-1">
          <textarea
            value={ruleText}
            onChange={e => setRuleText(e.target.value)}
            placeholder="e.g. Always collect 50% deposit for orders above K10,000"
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>
        <Button type="submit" disabled={saving || !ruleText.trim()} className="shrink-0">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          <span className="ml-1 hidden sm:inline">Add rule</span>
        </Button>
      </form>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No business rules yet"
          description='Add rules like "Always collect 50% deposit for orders above K10,000" or "Quotes are valid for 14 days".'
        />
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-start gap-3">
              <FileText className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
              <p className="flex-1 text-sm text-gray-800">{rule.factValue}</p>
              {deleteConfirm === rule.id ? (
                <div className="flex items-center gap-1.5 text-sm shrink-0">
                  <span className="text-gray-500">Delete?</span>
                  <button onClick={() => handleDelete(rule.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                  <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 hover:underline">No</button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(rule.id)}
                  className="shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Brand Module ─────────────────────────────────────────────────────────────

function BrandModule({ token }: { token: string | undefined }) {
  const { data: profileData, loading, refetch } = useApi<{ profile: BusinessProfile }>(
    token ? '/api/business-profile' : null, token,
  )
  const { addToast } = useToast()
  const profile = profileData?.profile

  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form, setForm] = useState({
    business_name:   '',
    tagline:         '',
    industry:        '',
    primary_color:   '#6366f1',
    secondary_color: '#8b5cf6',
    brand_voice:     '',
    company_values:  '',
  })

  useEffect(() => {
    if (profile) {
      setForm({
        business_name:   profile.business_name   ?? '',
        tagline:         profile.tagline          ?? '',
        industry:        profile.industry         ?? '',
        primary_color:   profile.primary_color    ?? '#6366f1',
        secondary_color: profile.secondary_color  ?? '#8b5cf6',
        brand_voice:     profile.brand_voice      ?? '',
        company_values:  profile.company_values   ?? '',
      })
    }
  }, [profile])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiClient('/api/business-profile', { method: 'PATCH', token, body: JSON.stringify(form) })
      addToast({ variant: 'success', title: 'Brand profile saved' })
      setEditing(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save profile' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <SkeletonCard />

  return (
    <div className="space-y-6">
      {/* Profile display */}
      {profile && !editing && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {profile.logo_url ? (
                <img
                  src={profile.logo_url}
                  alt="Logo"
                  className="w-16 h-16 rounded-xl object-cover border border-gray-200"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-white text-xl font-bold"
                  style={{ background: profile.primary_color ?? '#6366f1' }}
                >
                  {(profile.business_name ?? 'B')[0].toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-gray-900">{profile.business_name ?? 'Untitled Business'}</h2>
                {profile.tagline  && <p className="text-sm text-gray-500 mt-0.5">{profile.tagline}</p>}
                {profile.industry && <Badge variant="info" className="mt-2">{profile.industry}</Badge>}
              </div>
            </div>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Edit2 className="w-4 h-4 mr-1.5" />
              Edit
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {profile.brand_voice && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Brand Voice</p>
                <p className="text-sm text-gray-700">{profile.brand_voice}</p>
              </div>
            )}
            {profile.company_values && (
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Company Values</p>
                <p className="text-sm text-gray-700">{profile.company_values}</p>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-3 items-center">
            <p className="text-xs text-gray-500">Brand colors:</p>
            {[profile.primary_color, profile.secondary_color, profile.accent_color]
              .filter(Boolean)
              .map((c, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full border border-gray-200 shadow-sm"
                  style={{ background: c! }}
                  title={c!}
                />
              ))}
          </div>
        </div>
      )}

      {/* Edit / Create form */}
      {(editing || !profile) && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          <p className="font-semibold text-gray-900">
            {profile ? 'Edit Brand Profile' : 'Set Up Your Brand'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Business Name</label>
              <input
                value={form.business_name}
                onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                placeholder="Acme Ltd"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tagline</label>
              <input
                value={form.tagline}
                onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                placeholder="Building the future of..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Industry</label>
              <input
                value={form.industry}
                onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                placeholder="Technology, Retail, Services..."
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1"
                  />
                  <span className="text-xs text-gray-500 font-mono">{form.primary_color}</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Secondary Color</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.secondary_color}
                    onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1"
                  />
                  <span className="text-xs text-gray-500 font-mono">{form.secondary_color}</span>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Brand Voice</label>
              <textarea
                value={form.brand_voice}
                onChange={e => setForm(f => ({ ...f, brand_voice: e.target.value }))}
                placeholder="Professional but approachable. We avoid jargon and speak plainly..."
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Company Values</label>
              <textarea
                value={form.company_values}
                onChange={e => setForm(f => ({ ...f, company_values: e.target.value }))}
                placeholder="Customer first. Quality over speed. Transparency in all dealings..."
                rows={3}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {profile && (
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
              Save Profile
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

// ─── Knowledge Module ─────────────────────────────────────────────────────────

function KnowledgeModule({ token }: { token: string | undefined }) {
  const { data: kbData, loading } = useApi<{ documents: KBDocument[]; total?: number }>(
    token ? '/api/knowledge' : null, token,
  )

  const docs  = kbData?.documents ?? []
  const total = kbData?.total ?? docs.length

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <BookOpen className="w-4 h-4 text-indigo-600" />
          <p className="text-sm font-semibold text-indigo-900">Knowledge Base</p>
        </div>
        <p className="text-sm text-indigo-700">
          Documents and URLs in your Knowledge Base are used by Zuri to answer customer questions accurately over WhatsApp.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-gray-900">Knowledge Documents</p>
            <p className="text-sm text-gray-500">
              {loading ? 'Loading...' : `${total} document${total !== 1 ? 's' : ''} indexed`}
            </p>
          </div>
          <Link href="/knowledge">
            <Button variant="secondary">
              <BookOpen className="w-4 h-4 mr-1.5" />
              Manage KB
            </Button>
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <EmptyState
            title="No KB documents yet"
            description="Go to the Knowledge page to add documents and URLs."
            action={
              <Link href="/knowledge">
                <Button><Plus className="w-4 h-4 mr-1.5" />Add documents</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {docs.slice(0, 5).map(doc => (
              <div key={doc.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{doc.title}</p>
                  <p className="text-xs text-gray-400">{doc.type}</p>
                </div>
              </div>
            ))}
            {docs.length > 5 && (
              <Link href="/knowledge" className="block text-center text-sm text-indigo-600 hover:underline pt-1">
                View all {docs.length} documents
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Marketing Module ─────────────────────────────────────────────────────────

function MarketingModule({ token }: { token: string | undefined }) {
  const { data: productsData, loading: productsLoading } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: postsData,    loading: postsLoading }    = useApi<{ posts: SocialPost[] }>(
    token ? '/api/social-posts' : null, token,
  )
  const { data: accountsData, loading: accountsLoading } = useApi<{ accounts: SocialAccount[] }>(
    token ? '/api/social-accounts' : null, token,
  )
  const { addToast } = useToast()

  const products = productsData?.products ?? []
  const posts    = postsData?.posts       ?? []
  const accounts = accountsData?.accounts ?? []

  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [expandedId,   setExpandedId]   = useState<string | null>(null)
  const [generations,  setGenerations]  = useState<Record<string, Generation[]>>({})
  const [loadingGenId, setLoadingGenId] = useState<string | null>(null)

  async function handleGenerate(id: string) {
    setGeneratingId(id)
    try {
      await apiClient(`/api/products/${id}/generate`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'AI content generated' })
      await loadGenerations(id)
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Generation failed' })
    } finally {
      setGeneratingId(null)
    }
  }

  async function loadGenerations(id: string) {
    if (!token) return
    setLoadingGenId(id)
    try {
      const res = await apiClient<{ generations: Generation[] }>(`/api/products/${id}/generations`, { token })
      setGenerations(prev => ({ ...prev, [id]: res.generations ?? [] }))
    } catch {
      // silently skip
    } finally {
      setLoadingGenId(null)
    }
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      if (!generations[id]) loadGenerations(id)
    }
  }

  function postStatusVariant(status: string): 'default' | 'success' | 'warning' | 'error' {
    switch (status) {
      case 'published': return 'success'
      case 'scheduled': return 'warning'
      case 'failed':    return 'error'
      default:          return 'default'
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Content Generation ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          Content Generation
        </h3>

        {productsLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : products.length === 0 ? (
          <EmptyState title="No products" description="Add catalog items to generate marketing content." />
        ) : (
          <div className="space-y-3">
            {products.map(p => {
              const isExpanded = expandedId === p.id
              const gens = generations[p.id] ?? []
              return (
                <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.itemType.replace('_', ' ')}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleGenerate(p.id)}
                      disabled={generatingId === p.id}
                    >
                      {generatingId === p.id
                        ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                        : <Sparkles className="w-3.5 h-3.5 mr-1" />}
                      Generate
                    </Button>
                    <button
                      onClick={() => toggleExpand(p.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-400"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4">
                      {loadingGenId === p.id ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          Loading generated content...
                        </div>
                      ) : gens.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          No content generated yet. Click &quot;Generate&quot; to create AI marketing copy.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {gens.map(gen => (
                            <div key={gen.id} className="bg-gray-50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <Badge variant="default">{gen.type}</Badge>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(gen.content)
                                    addToast({ variant: 'success', title: 'Copied to clipboard!' })
                                  }}
                                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                                  title="Copy"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{gen.content}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Social Posts ── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-indigo-500" />
          Social Posts
        </h3>

        {/* Connected accounts */}
        {!accountsLoading && accounts.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {accounts.map(a => (
              <div key={a.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs">
                <span className={`w-2 h-2 rounded-full ${a.connected ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="font-medium">{a.platform}</span>
                <span className="text-gray-500">@{a.username}</span>
              </div>
            ))}
          </div>
        )}

        {postsLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        ) : posts.length === 0 ? (
          <EmptyState title="No social posts yet" description="Generated social posts will appear here." />
        ) : (
          <div className="space-y-3">
            {posts.map(post => (
              <div key={post.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{post.platform}</Badge>
                    <Badge variant={postStatusVariant(post.status)}>{post.status}</Badge>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(post.content)
                      addToast({ variant: 'success', title: 'Copied to clipboard!' })
                    }}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400"
                    title="Copy"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-4">{post.content}</p>
                <p className="text-xs text-gray-400 mt-2">{new Date(post.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page Component ──────────────────────────────────────────────────────

export default function StudioPage() {
  const session = useZuriSession()
  // accessToken is string | undefined; coerce null → undefined for props
  const token = session.data?.accessToken ?? undefined

  const [activeModule, setActiveModule] = useState<Module>('overview')

  function renderModule() {
    switch (activeModule) {
      case 'overview':  return <OverviewModule  token={token} />
      case 'catalog':   return <CatalogModule   token={token} />
      case 'inventory': return <InventoryModule  token={token} />
      case 'pricing':   return <PricingModule    token={token} />
      case 'suppliers': return <SuppliersModule  token={token} />
      case 'rules':     return <RulesModule      token={token} />
      case 'brand':     return <BrandModule      token={token} />
      case 'knowledge': return <KnowledgeModule  token={token} />
      case 'marketing': return <MarketingModule  token={token} />
      default:          return null
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-14 pb-14 md:pt-0 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <PageHeader
          title="Business Knowledge Hub"
          description="Single source of truth for your business data — feeds Zuri's AI intelligence engines."
        />

        {/* Module Tab Bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex overflow-x-auto border-b border-gray-100">
            {MODULES.map(({ id, label, Icon }) => {
              const isActive = activeModule === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveModule(id)}
                  style={{ minHeight: '44px' }}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 shrink-0 ${
                    isActive
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Active Module */}
        <div>{renderModule()}</div>
      </div>
    </div>
  )
}
