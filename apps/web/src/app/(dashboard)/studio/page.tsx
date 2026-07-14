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
  Upload,
  Image,
  Phone,
  Mail,
  Globe,
  Link2,
  ExternalLink,
  Radio,
  Tv2,
  Film,
  AtSign,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/ui/page-header'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { ChatFormatter, type ParsedAction } from '@/components/ui/chat-formatter'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { uploadProductImage } from '@/lib/storage'

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
  | 'social'

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
  minPrice: number | null
  maxPrice: number | null
  discountMinPct: number
  discountMaxPct: number
  createdAt: string
  updatedAt: string
  // Business OS Phase A — configurable families & attributes
  familyId: string | null
  attributes: Record<string, any>
  parentProductId: string | null
  variantCount?: number
}

interface ProductFamily {
  id: string
  parentId: string | null
  name: string
  path: string | null
  sortOrder: number
}

interface AttributeDefinition {
  id: string
  familyId: string
  key: string
  label: string
  dataType: 'text' | 'number' | 'select' | 'multiselect' | 'boolean' | 'date'
  options: string[]
  isVariantAxis: boolean
  isRequired: boolean
  sortOrder: number
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

type StockMovementType = 'restock' | 'sale' | 'adjustment' | 'waste' | 'return'

interface StockMovement {
  id: string
  movementType: StockMovementType
  quantityDelta: number
  previousStock: number
  newStock: number
  reason: string | null
  createdAt: string
}

interface StudioInsights {
  stats: {
    totalProducts: number
    inventoryValue: number
    lowStockCount: number
    outOfStockCount: number
    totalSuppliers: number
    outstandingSupplierBalance: number
    activeRules: number
  }
  lowStock: { id: string; name: string; available: number; minimumStock: number }[]
  thinMargin: { id: string; name: string; sellingPrice: number; purchaseCost: number; marginPct: number }[]
  supplierFlags: { id: string; company: string; reliabilityScore: number; averageDeliveryTime: number; flag: 'low_reliability' | 'slow_delivery' }[]
  suggestedPurchaseOrders: {
    productId: string; productName: string; available: number; minimumStock: number; incoming: number
    supplierId: string; supplierName: string; unitCost: number | null; leadTimeDays: number | null
    quantity: number; estimatedCost: number | null
  }[]
}

interface SupplierProduct {
  supplierId: string
  productId: string
  productName?: string
  supplierName?: string
  cost: number | null
  leadTimeDays: number | null
  minimumQty: number | null
}

interface PurchaseOrderDoc {
  id: string
  documentNumber: string
  title: string
  status: string
  supplierId: string | null
  currency: string
  totalCents: number
  structuredData: { supplierName?: string; expectedDeliveryDate?: string | null; items?: { description: string; quantity: number; unitPriceCents: number }[] }
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
  companyName: string | null
  tagline: string | null
  industry: string | null
  logoUrl: string | null
  themeColor: string | null
  accentColor: string | null
  brandVoice: string | null
  companyValues: string | null
  address: string | null
  phone: string | null
  email: string | null
  website: string | null
  bankDetails: Record<string, string>
  mobileMoney: Record<string, string>
  defaultCurrency: string | null
  defaultTaxRate: number
  footerText: string | null
  defaultTerms: string | null
  paymentInstructions: string | null
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
  { id: 'social',     label: 'Social',     Icon: Globe },
]

// ─── Overview Module ──────────────────────────────────────────────────────────

function OverviewModule({ token, initialPrompt, onConsumedPrompt }: {
  token: string | undefined
  initialPrompt?: string | null
  onConsumedPrompt?: () => void
}) {
  const { data: productsData, loading: productsLoading } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: suppliersData, loading: suppliersLoading } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { data: rulesData, loading: rulesLoading } = useApi<{ facts: BusinessFact[] }>(
    token ? '/api/business-facts?category=business_rule' : null, token,
  )
  const { data: insights } = useApi<StudioInsights>(token ? '/api/studio/insights' : null, token)

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
    'Draft a restock follow-up to my slowest supplier',
    'Which customers should I follow up with this week?',
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

  // A tab's "Ask AI" insight prefills the input here rather than auto-sending —
  // keeps the user in control of what actually gets sent to the LLM.
  useEffect(() => {
    if (!initialPrompt) return
    setInput(initialPrompt)
    onConsumedPrompt?.()
  }, [initialPrompt]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Business actions the advisor can trigger via [ACTION: ...] tags — same
  // contract as advisor/page.tsx and inbox/_components/intel-panel.tsx.
  async function handleChatAction(action: ParsedAction) {
    if (!token) return
    switch (action.type) {
      case 'lead_score': {
        const [score, contactId] = action.params
        await apiClient(`/api/contacts/${contactId}`, { method: 'PATCH', token, body: JSON.stringify({ leadScore: parseInt(score, 10) }) })
        return
      }
      case 'pipeline_stage': {
        const [stage, contactId] = action.params
        await apiClient(`/api/contacts/${contactId}`, { method: 'PATCH', token, body: JSON.stringify({ pipelineStage: stage }) })
        return
      }
      case 'reminder': {
        const [title, date] = action.params
        await apiClient('/api/calendar/events', { method: 'POST', token, body: JSON.stringify({ title, eventDate: date, eventType: 'reminder' }) })
        return
      }
      case 'reply_draft': {
        const [contactId, draftText] = action.params
        const res = await apiClient<{ conversationId: string | null }>(`/api/contacts/${contactId}/messages`, { token })
        if (!res.conversationId) throw new Error('No WhatsApp conversation found for this contact yet')
        await apiClient(`/api/conversations/${res.conversationId}/messages`, { method: 'POST', token, body: JSON.stringify({ text: draftText }) })
        return
      }
      case 'generate_document': {
        const [documentType, contactId, ...briefParts] = action.params
        const brief = briefParts.join(' | ')
        const data = await apiClient<{ document: { id: string } }>('/api/documents/ai-generate', {
          method: 'POST', token, body: JSON.stringify({ contactId, documentType, instruction: brief || `Draft a ${documentType}` }),
        })
        await apiClient(`/api/documents/${data.document.id}/generate`, { method: 'POST', token })
        return
      }
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
              <div key={label} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">{label}</p>
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <p className="text-2xl font-bold text-gray-900">{value}</p>
              </div>
            ))
        }
      </div>

      {/* Business Pulse — quick top-line stats from Zuri Insights */}
      {insights && (
        <div className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[140px] rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-100">
            <p className="text-[11px] font-semibold text-gray-500">Inventory Value</p>
            <p className="text-lg font-black text-gray-950 tabular-nums">{formatCurrency(insights.stats.inventoryValue)}</p>
          </div>
          <div className="flex-1 min-w-[140px] rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-100">
            <p className="text-[11px] font-semibold text-gray-500">Owed to Suppliers</p>
            <p className="text-lg font-black text-gray-950 tabular-nums">{formatCurrency(insights.stats.outstandingSupplierBalance)}</p>
          </div>
          <div className="flex-1 min-w-[140px] rounded-2xl bg-white/80 px-4 py-3 shadow-sm ring-1 ring-gray-100">
            <p className="text-[11px] font-semibold text-gray-500">Needs Attention</p>
            <p className="text-lg font-black text-gray-950 tabular-nums">
              {insights.stats.lowStockCount + insights.stats.outOfStockCount + insights.thinMargin.length + insights.supplierFlags.length}
            </p>
          </div>
        </div>
      )}

      {/* AI Business Advisor Chat */}
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-white via-indigo-50 to-cyan-50 shadow-2xl shadow-indigo-200/40 ring-1 ring-white flex flex-col" style={{ height: '620px' }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_88%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_6%_84%,rgba(129,140,248,0.16),transparent_30%)] pointer-events-none" />

        <div className="relative z-10 flex items-center gap-2.5 px-5 py-4 border-b border-white/60">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold shadow-lg shadow-indigo-200">Z</div>
          <div>
            <p className="font-bold text-gray-900 text-sm">AI Business Advisor</p>
            <p className="text-[11px] text-gray-500">Knows your catalog, stock, suppliers &amp; customers</p>
          </div>
        </div>

        {sessionLoading ? (
          <div className="relative z-10 flex-1 flex items-center justify-center">
            <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && !typing && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 text-center pt-4">Ask your Business Advisor anything</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SUGGESTED.map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="text-left text-xs font-medium text-gray-700 bg-white/80 hover:bg-white border border-white ring-1 ring-gray-100 rounded-2xl p-3 shadow-sm transition-all hover:-translate-y-0.5"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(msg => {
                const isUser = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 shadow-lg shadow-indigo-200">Z</div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                      isUser
                        ? 'bg-indigo-600 text-white whitespace-pre-wrap shadow-lg shadow-indigo-200'
                        : 'bg-white border border-white text-slate-800 shadow-sm shadow-slate-200/80 ring-1 ring-slate-100'
                    }`}>
                      {isUser ? (
                        msg.content
                      ) : (
                        <>
                          <ChatFormatter content={msg.content} theme="light" onAction={handleChatAction} />
                          <div className="flex items-center justify-end border-t border-slate-100 pt-2 mt-2">
                            <button onClick={() => navigator.clipboard.writeText(msg.content)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700" title="Copy">
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {isUser && (
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-[10px] font-bold flex-shrink-0 mt-0.5">You</div>
                    )}
                  </div>
                )
              })}
              {typing && (
                <div className="flex gap-2.5 items-center">
                  <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold animate-pulse shadow-lg shadow-indigo-200">Z</div>
                  <div className="bg-white border border-white rounded-2xl px-4 py-2.5 shadow-sm ring-1 ring-slate-100">
                    <span className="flex gap-1">
                      {[0, 150, 300].map(d => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="relative z-10 border-t border-white/60 px-4 py-3">
              <form onSubmit={e => { e.preventDefault(); sendMessage(input) }} className="flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Ask about your business..."
                  disabled={typing}
                  className="flex-1 rounded-2xl border border-gray-100 bg-white px-3.5 py-2.5 text-sm shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || typing}
                  className="shrink-0 w-10 h-10 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center disabled:opacity-40 transition-all shadow-lg shadow-indigo-500/25"
                >
                  <Send className="w-4 h-4" />
                </button>
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
  familyId: '',
}

// ─── Product Families & Attributes (Business OS Phase A) ──────────────────────
// See docs/BUSINESS_OS_PLAN.md §5 — configurable "exactly like Odoo" custom
// attributes per product family, no code required. product_families is the
// user-defined hierarchy; product_attribute_definitions is the schema a
// family's products render fields from.

const ATTRIBUTE_TYPE_LABELS: Record<AttributeDefinition['dataType'], string> = {
  text: 'Text', number: 'Number', select: 'Single select',
  multiselect: 'Multi select', boolean: 'Yes/No', date: 'Date',
}

function familyDepth(f: ProductFamily): number {
  return f.path ? f.path.split('/').length - 1 : 0
}

function buildFamilyTree(families: ProductFamily[]): ProductFamily[] {
  // Sort by path so parents always precede children — good enough for a
  // flat indented list without building an explicit tree structure.
  return [...families].sort((a, b) => (a.path ?? a.name).localeCompare(b.path ?? b.name))
}

function DynamicAttributeFields({
  definitions, values, onChange,
}: { definitions: AttributeDefinition[]; values: Record<string, any>; onChange: (key: string, value: any) => void }) {
  if (definitions.length === 0) return null
  return (
    <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-indigo-50/50 ring-1 ring-indigo-100 p-3">
      <p className="sm:col-span-2 text-xs font-semibold text-indigo-700 -mb-1">Type-specific attributes</p>
      {definitions.map(def => (
        <div key={def.key}>
          <label className="block text-xs text-gray-500 mb-1">
            {def.label}{def.isRequired ? ' *' : ''}
            {def.isVariantAxis && <span className="ml-1 text-indigo-500">(variant)</span>}
          </label>
          {def.dataType === 'boolean' ? (
            <select
              value={values[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          ) : def.dataType === 'select' ? (
            <select
              value={values[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">—</option>
              {def.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : def.dataType === 'multiselect' ? (
            <select
              multiple
              value={Array.isArray(values[def.key]) ? values[def.key] : []}
              onChange={e => onChange(def.key, Array.from(e.target.selectedOptions).map(o => o.value))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {def.options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              type={def.dataType === 'number' ? 'number' : def.dataType === 'date' ? 'date' : 'text'}
              value={values[def.key] ?? ''}
              onChange={e => onChange(def.key, e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          )}
        </div>
      ))}
    </div>
  )
}

function ProductFamiliesManager({ token, onClose }: { token: string | undefined; onClose: () => void }) {
  const { data: familiesData, loading, refetch } = useApi<{ families: ProductFamily[] }>(
    token ? '/api/product-families' : null, token,
  )
  const families = buildFamilyTree(familiesData?.families ?? [])
  const { addToast } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newParentId, setNewParentId] = useState('')
  const [savingFamily, setSavingFamily] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const { data: attrsData, refetch: refetchAttrs } = useApi<{ attributes: AttributeDefinition[] }>(
    token && selectedId ? `/api/product-families/${selectedId}/attributes` : null, token,
  )
  const attributes = attrsData?.attributes ?? []

  const [attrForm, setAttrForm] = useState({
    key: '', label: '', dataType: 'text' as AttributeDefinition['dataType'],
    options: '', isVariantAxis: false, isRequired: false,
  })
  const [savingAttr, setSavingAttr] = useState(false)

  async function addFamily(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setSavingFamily(true)
    try {
      await apiClient('/api/product-families', {
        method: 'POST', token,
        body: JSON.stringify({ name: newName.trim(), parentId: newParentId || null }),
      })
      setNewName(''); setNewParentId('')
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add family' })
    } finally {
      setSavingFamily(false)
    }
  }

  async function renameFamily(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return }
    try {
      await apiClient(`/api/product-families/${id}`, { method: 'PATCH', token, body: JSON.stringify({ name: renameValue.trim() }) })
      setRenamingId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to rename' })
    }
  }

  async function deleteFamily(id: string) {
    try {
      await apiClient(`/api/product-families/${id}`, { method: 'DELETE', token })
      if (selectedId === id) setSelectedId(null)
      addToast({ variant: 'success', title: 'Product type deleted' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete' })
    }
  }

  async function addAttribute(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId || !attrForm.key.trim() || !attrForm.label.trim()) return
    setSavingAttr(true)
    try {
      await apiClient(`/api/product-families/${selectedId}/attributes`, {
        method: 'POST', token,
        body: JSON.stringify({
          key: attrForm.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
          label: attrForm.label.trim(),
          dataType: attrForm.dataType,
          options: attrForm.options ? attrForm.options.split(',').map(o => o.trim()).filter(Boolean) : [],
          isVariantAxis: attrForm.isVariantAxis,
          isRequired: attrForm.isRequired,
        }),
      })
      setAttrForm({ key: '', label: '', dataType: 'text', options: '', isVariantAxis: false, isRequired: false })
      refetchAttrs()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to add attribute' })
    } finally {
      setSavingAttr(false)
    }
  }

  async function deleteAttribute(id: string) {
    try {
      await apiClient(`/api/product-attribute-definitions/${id}`, { method: 'DELETE', token })
      refetchAttrs()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to delete attribute' })
    }
  }

  const selectedFamily = families.find(f => f.id === selectedId) ?? null

  return (
    <Modal open onClose={onClose} title="Manage Product Types" description="Define your own product families and the custom attributes each one needs — no code required." size="full">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Families tree */}
        <div className="md:col-span-2 space-y-3">
          <form onSubmit={addFamily} className="flex flex-col gap-2 bg-gray-50 rounded-xl p-3">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Clothing, Motor Spares..."
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="flex gap-2">
              <select
                value={newParentId}
                onChange={e => setNewParentId(e.target.value)}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Top-level</option>
                {families.map(f => (
                  <option key={f.id} value={f.id}>{'—'.repeat(familyDepth(f))} {f.name}</option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={savingFamily}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </form>

          {loading ? (
            <SkeletonCard />
          ) : families.length === 0 ? (
            <p className="text-xs text-gray-500 px-1">No product types yet. Add one above — e.g. "Electronics" or "Clothing".</p>
          ) : (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {families.map(f => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${selectedId === f.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                  style={{ paddingLeft: `${12 + familyDepth(f) * 16}px` }}
                  onClick={() => setSelectedId(f.id)}
                >
                  {renamingId === f.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => renameFamily(f.id)}
                      onKeyDown={e => { if (e.key === 'Enter') renameFamily(f.id) }}
                      className="flex-1 rounded border border-indigo-300 px-2 py-0.5 text-sm"
                    />
                  ) : (
                    <span className="flex-1 text-sm text-gray-800 truncate">{f.name}</span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); setRenamingId(f.id); setRenameValue(f.name) }}
                    className="p-1 rounded hover:bg-white text-gray-400"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteFamily(f.id) }}
                    className="p-1 rounded hover:bg-white text-red-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attribute definitions for the selected family */}
        <div className="md:col-span-3">
          {!selectedFamily ? (
            <EmptyState title="Select a product type" description="Pick a product type on the left to define its custom attributes (Size, Color, Vehicle Model, Prep Time...)." />
          ) : (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-900">{selectedFamily.path}</p>

              {attributes.length > 0 && (
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
                  {attributes.map(a => (
                    <div key={a.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">
                          {a.label} <span className="text-xs text-gray-400">({a.key})</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          {ATTRIBUTE_TYPE_LABELS[a.dataType]}
                          {a.options.length > 0 ? `: ${a.options.join(', ')}` : ''}
                          {a.isVariantAxis ? ' · generates variants' : ''}
                          {a.isRequired ? ' · required' : ''}
                        </p>
                      </div>
                      <button onClick={() => deleteAttribute(a.id)} className="p-1.5 rounded hover:bg-gray-50 text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addAttribute} className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Attribute name *</label>
                  <input
                    value={attrForm.label}
                    onChange={e => setAttrForm(f => ({ ...f, label: e.target.value, key: f.key || e.target.value }))}
                    placeholder="Color, Vehicle Model, Prep Time..."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Field type</label>
                  <select
                    value={attrForm.dataType}
                    onChange={e => setAttrForm(f => ({ ...f, dataType: e.target.value as AttributeDefinition['dataType'] }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(ATTRIBUTE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {(attrForm.dataType === 'select' || attrForm.dataType === 'multiselect') && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-1">Options (comma-separated)</label>
                    <input
                      value={attrForm.options}
                      onChange={e => setAttrForm(f => ({ ...f, options: e.target.value }))}
                      placeholder="Small, Medium, Large"
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={attrForm.isVariantAxis} onChange={e => setAttrForm(f => ({ ...f, isVariantAxis: e.target.checked }))} />
                  Generates variants (e.g. Size, Color)
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={attrForm.isRequired} onChange={e => setAttrForm(f => ({ ...f, isRequired: e.target.checked }))} />
                  Required
                </label>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={savingAttr}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add attribute
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

// Attribute values + variant generation for a single product, shown inside
// the expanded catalog card. Variants are just `products` rows with
// parent_product_id set — no separate variants table (see
// docs/BUSINESS_OS_PLAN.md §5).
function ProductVariantsPanel({
  token, product, onChanged,
}: { token: string | undefined; product: Product; onChanged: () => void }) {
  const { addToast } = useToast()
  const { data: attrsData } = useApi<{ attributes: AttributeDefinition[] }>(
    token && product.familyId ? `/api/product-families/${product.familyId}/effective-attributes` : null, token,
  )
  const definitions = attrsData?.attributes ?? []
  const axisDefs = definitions.filter(a => a.isVariantAxis)

  const { data: variantsData, refetch: refetchVariants } = useApi<{ variants: Product[] }>(
    token && !product.parentProductId ? `/api/products/${product.id}/variants` : null, token,
  )
  const variants = variantsData?.variants ?? []

  const [axisInputs, setAxisInputs] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [archivingId, setArchivingId] = useState<string | null>(null)

  if (product.parentProductId) return null // a variant itself has no sub-variants

  const attributeEntries = Object.entries(product.attributes ?? {}).filter(([, v]) => v !== '' && v != null)

  async function generateVariants() {
    const axisValues: Record<string, string[]> = {}
    for (const def of axisDefs) {
      const raw = axisInputs[def.key] ?? ''
      const values = raw.split(',').map(v => v.trim()).filter(Boolean)
      if (values.length > 0) axisValues[def.key] = values
    }
    if (Object.keys(axisValues).length !== axisDefs.length) {
      addToast({ variant: 'error', title: `Enter values for every variant attribute (${axisDefs.map(a => a.label).join(', ')})` })
      return
    }
    setGenerating(true)
    try {
      const res = await apiClient<{ variants: Product[] }>(`/api/products/${product.id}/generate-variants`, {
        method: 'POST', token, body: JSON.stringify({ axisValues }),
      })
      addToast({ variant: 'success', title: `Generated ${res.variants.length} variant${res.variants.length === 1 ? '' : 's'}` })
      setAxisInputs({})
      refetchVariants()
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to generate variants' })
    } finally {
      setGenerating(false)
    }
  }

  async function archiveVariant(id: string) {
    setArchivingId(id)
    try {
      await apiClient(`/api/products/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'archived' }) })
      refetchVariants()
      onChanged()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to remove variant' })
    } finally {
      setArchivingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {attributeEntries.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {attributeEntries.map(([key, value]) => {
            const def = definitions.find(d => d.key === key)
            return (
              <Badge key={key} variant="purple">
                {def?.label ?? key}: {Array.isArray(value) ? value.join(', ') : String(value)}
              </Badge>
            )
          })}
        </div>
      )}

      {variants.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Variants ({variants.length})</p>
          <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {variants.map(v => (
              <div key={v.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                <span className="flex-1 truncate text-gray-700">{v.name}</span>
                <span className="text-gray-400">{v.available} in stock</span>
                <button
                  onClick={() => archiveVariant(v.id)}
                  disabled={archivingId === v.id}
                  className="p-1 rounded hover:bg-gray-100 text-red-400"
                  title="Remove variant"
                >
                  {archivingId === v.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {axisDefs.length > 0 && (
        <div className="rounded-lg bg-indigo-50/50 ring-1 ring-indigo-100 p-3 space-y-2">
          <p className="text-xs font-semibold text-indigo-700">Generate variants</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {axisDefs.map(def => (
              <div key={def.key}>
                <label className="block text-xs text-gray-500 mb-1">{def.label} (comma-separated)</label>
                <input
                  value={axisInputs[def.key] ?? ''}
                  onChange={e => setAxisInputs(v => ({ ...v, [def.key]: e.target.value }))}
                  placeholder={def.options.length > 0 ? def.options.join(', ') : 'e.g. Small, Medium, Large'}
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={generateVariants} disabled={generating}>
              {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Layers className="w-3.5 h-3.5 mr-1" />}
              Generate
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogModule({ token }: { token: string | undefined }) {
  const { data: productsData, loading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: suppliersData } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { data: familiesData } = useApi<{ families: ProductFamily[] }>(
    token ? '/api/product-families' : null, token,
  )
  const { addToast } = useToast()

  const products  = productsData?.products  ?? []
  const suppliers = suppliersData?.suppliers ?? []
  const families  = buildFamilyTree(familiesData?.families ?? [])

  const [filter,         setFilter]         = useState<CatalogFilter>('All')
  const [showAdd,        setShowAdd]        = useState(false)
  const [showFamilies,   setShowFamilies]   = useState(false)
  const [expandedId,     setExpandedId]     = useState<string | null>(null)
  const [deleteConfirm,  setDeleteConfirm]  = useState<string | null>(null)
  const [generatingId,   setGeneratingId]   = useState<string | null>(null)
  const [syncingId,      setSyncingId]      = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [form,           setForm]           = useState({ ...BLANK_CATALOG_FORM })
  const [attrValues,     setAttrValues]     = useState<Record<string, any>>({})
  const [uploadingImgId, setUploadingImgId] = useState<string | null>(null)
  const imgInputRef                         = useRef<HTMLInputElement>(null)
  const [imgTargetId,    setImgTargetId]    = useState<string | null>(null)

  const { data: effectiveAttrsData } = useApi<{ attributes: AttributeDefinition[] }>(
    token && form.familyId ? `/api/product-families/${form.familyId}/effective-attributes` : null, token,
  )
  const formAttributeDefs = effectiveAttrsData?.attributes ?? []

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
          familyId:     form.familyId     || null,
          attributes:   attrValues,
        }),
      })
      addToast({ variant: 'success', title: 'Item added' })
      setForm({ ...BLANK_CATALOG_FORM })
      setAttrValues({})
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

  async function handleImageUpload(file: File, product: Product) {
    setUploadingImgId(product.id)
    try {
      const url = await uploadProductImage(product.id, file)
      const newImages = [...(product.images ?? []), url]
      await apiClient(`/api/products/${product.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ images: newImages }),
      })
      addToast({ variant: 'success', title: 'Image uploaded' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Upload failed' })
    } finally {
      setUploadingImgId(null)
    }
  }

  async function handleRemoveImage(product: Product, imgUrl: string) {
    const newImages = product.images.filter(u => u !== imgUrl)
    try {
      await apiClient(`/api/products/${product.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ images: newImages }),
      })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to remove image' })
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
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" onClick={() => setShowFamilies(true)}>
            <Layers className="w-4 h-4 mr-1.5" />
            Product Types
          </Button>
          <Button onClick={() => setShowAdd(v => !v)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add item
          </Button>
        </div>
      </div>

      {showFamilies && <ProductFamiliesManager token={token} onClose={() => setShowFamilies(false)} />}

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-[1.75rem] border border-indigo-200 shadow-sm shadow-indigo-100/70 p-4 space-y-4">
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Product Type</label>
              <select
                value={form.familyId}
                onChange={e => { setForm(f => ({ ...f, familyId: e.target.value })); setAttrValues({}) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">None (generic)</option>
                {families.map(f => (
                  <option key={f.id} value={f.id}>{'—'.repeat(familyDepth(f))} {f.name}</option>
                ))}
              </select>
            </div>
            <DynamicAttributeFields
              definitions={formAttributeDefs}
              values={attrValues}
              onChange={(key, value) => setAttrValues(v => ({ ...v, [key]: value }))}
            />
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
            <Button variant="secondary" type="button" onClick={() => { setShowAdd(false); setForm({ ...BLANK_CATALOG_FORM }); setAttrValues({}) }}>
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
              <div key={p.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 overflow-hidden">
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

                    {/* Images */}
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                        <Image className="w-3.5 h-3.5" />
                        Images
                      </p>
                      <div className="flex gap-2 flex-wrap items-start">
                        {p.images?.map(url => (
                          <div key={url} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => handleRemoveImage(p, url)}
                              className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                            >
                              <X className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        ))}
                        <label
                          className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-400 flex flex-col items-center justify-center cursor-pointer transition-colors gap-1"
                          title="Upload image"
                        >
                          {uploadingImgId === p.id
                            ? <RefreshCw className="w-4 h-4 text-indigo-500 animate-spin" />
                            : <>
                                <Upload className="w-4 h-4 text-gray-400" />
                                <span className="text-[10px] text-gray-400">Add</span>
                              </>
                          }
                          <input
                            type="file"
                            accept="image/*,video/*"
                            className="sr-only"
                            disabled={uploadingImgId === p.id}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file) handleImageUpload(file, p)
                              e.target.value = ''
                            }}
                          />
                        </label>
                      </div>
                    </div>

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
                      {(p.discountMinPct > 0 || p.discountMaxPct > 0) && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Discount range:</span>{' '}
                          <span className="font-medium text-amber-700">{p.discountMinPct}% – {p.discountMaxPct}%</span>
                        </div>
                      )}
                      {(p.minPrice != null || p.maxPrice != null) && (
                        <div className="col-span-2">
                          <span className="text-gray-500">Price range:</span>{' '}
                          <span className="font-medium">{formatCurrency(p.minPrice, p.currency)} – {formatCurrency(p.maxPrice, p.currency)}</span>
                        </div>
                      )}
                    </div>

                    {p.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {p.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                      </div>
                    )}

                    <ProductVariantsPanel token={token} product={p} onChanged={refetch} />

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

const MOVEMENT_TYPE_META: Record<StockMovementType, { label: string; sign: 1 | -1 | 0; color: string }> = {
  restock:    { label: 'Restock',    sign: 1,  color: 'text-emerald-600' },
  return:     { label: 'Return',     sign: 1,  color: 'text-emerald-600' },
  sale:       { label: 'Sale',       sign: -1, color: 'text-indigo-600' },
  waste:      { label: 'Waste/Loss', sign: -1, color: 'text-red-600' },
  adjustment: { label: 'Adjustment', sign: 0,  color: 'text-gray-600' },
}

function StockAdjustModal({
  product, token, onClose, onSaved,
}: { product: Product; token: string | undefined; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToast()
  const [movementType, setMovementType] = useState<StockMovementType>('restock')
  const [quantity,     setQuantity]     = useState('')
  const [reason,       setReason]       = useState('')
  const [saving,       setSaving]       = useState(false)

  const meta = MOVEMENT_TYPE_META[movementType]
  const qtyNum = parseInt(quantity, 10) || 0
  const delta = movementType === 'adjustment' ? qtyNum : Math.abs(qtyNum) * (meta.sign as 1 | -1)
  const newStock = Math.max(0, product.stock + delta)

  async function submit() {
    if (!qtyNum) return
    setSaving(true)
    try {
      await apiClient(`/api/products/${product.id}/stock-movements`, {
        method: 'POST', token,
        body: JSON.stringify({ movementType, quantityDelta: delta, reason: reason.trim() || undefined }),
      })
      addToast({ variant: 'success', title: 'Stock updated' })
      onSaved()
      onClose()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to update stock' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-[1.75rem] shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold text-gray-900">Adjust Stock — {product.name}</h3>
          <p className="text-xs text-gray-500 mt-0.5">Current: {product.stock} on hand · {product.available} available</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Type of change</label>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(MOVEMENT_TYPE_META) as StockMovementType[]).map(t => (
              <button
                key={t}
                onClick={() => setMovementType(t)}
                className={`text-xs font-semibold py-2 rounded-xl border-2 transition-colors ${
                  movementType === t ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'
                }`}
              >
                {MOVEMENT_TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            {movementType === 'adjustment' ? 'Change (use – for a decrease)' : 'Quantity'}
          </label>
          <input
            type="number"
            value={quantity}
            onChange={e => setQuantity(e.target.value)}
            placeholder={movementType === 'adjustment' ? 'e.g. -3 or 5' : 'e.g. 10'}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Delivery from supplier, stock count correction..."
            rows={2}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        {qtyNum !== 0 && (
          <div className="bg-gray-50 rounded-xl p-3 text-sm flex items-center justify-between">
            <span className="text-gray-500">New stock level</span>
            <span className="font-bold text-gray-900">{product.stock} → {newStock}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !qtyNum}>
            {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  )
}

function MovementHistory({ productId, token }: { productId: string; token: string | undefined }) {
  const { data, loading } = useApi<{ movements: StockMovement[] }>(
    token ? `/api/products/${productId}/stock-movements` : null, token,
  )
  const movements = data?.movements ?? []

  if (loading) return <p className="text-xs text-gray-400 py-2">Loading history...</p>
  if (movements.length === 0) return <p className="text-xs text-gray-400 py-2">No stock movements recorded yet.</p>

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto">
      {movements.map(m => (
        <div key={m.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-2.5 py-2">
          <div>
            <span className={`font-semibold ${MOVEMENT_TYPE_META[m.movementType].color}`}>
              {MOVEMENT_TYPE_META[m.movementType].label}
            </span>
            <span className="text-gray-400 ml-1.5">{new Date(m.createdAt).toLocaleDateString()}</span>
            {m.reason && <p className="text-gray-500 mt-0.5">{m.reason}</p>}
          </div>
          <div className="text-right shrink-0 ml-2">
            <span className={`font-bold ${m.quantityDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {m.quantityDelta > 0 ? '+' : ''}{m.quantityDelta}
            </span>
            <p className="text-gray-400">{m.previousStock} → {m.newStock}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

function InventoryModule({ token, onAskAI }: { token: string | undefined; onAskAI: (prompt: string) => void }) {
  const { data: productsData, loading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: suppliersData } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { data: insights } = useApi<StudioInsights>(token ? '/api/studio/insights' : null, token)
  const products = productsData?.products ?? []
  const suppliers = suppliersData?.suppliers ?? []

  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)

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

  function reorderLink(p: Product): string | null {
    const supplier = suppliers.find(s => s.id === p.supplierId)
    if (!supplier?.whatsapp) return null
    const suggestedQty = Math.max(p.minimumStock * 2 - p.available, p.minimumStock, 1)
    const text = `Hi ${supplier.contact ?? supplier.company}, we're running low on ${p.name} (${p.available} left). Could you send a quote for restocking ${suggestedQty} units?`
    return `https://wa.me/${supplier.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
  }

  return (
    <div className="space-y-4">
      {/* AI Insights */}
      {insights && (insights.lowStock.length > 0 || insights.stats.outOfStockCount > 0) && (
        <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-amber-50 to-white border border-amber-100 shadow-sm shadow-amber-100/70 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {insights.stats.outOfStockCount > 0
                  ? `${insights.stats.outOfStockCount} item${insights.stats.outOfStockCount !== 1 ? 's are' : ' is'} out of stock`
                  : `${insights.stats.lowStockCount} item${insights.stats.lowStockCount !== 1 ? 's need' : ' needs'} reordering`}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {insights.lowStock.slice(0, 3).map(p => p.name).join(', ')}
                {insights.lowStock.length > 3 ? ` +${insights.lowStock.length - 3} more` : ''} — worth restocking before you run out.
              </p>
              <button
                onClick={() => onAskAI(`Help me plan reorders for: ${insights.lowStock.map(p => p.name).join(', ')}`)}
                className="mt-2 text-xs font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />Ask AI to plan reorders
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total SKUs',    value: totalSKUs,   color: 'text-gray-900'   },
          { label: 'In Stock',      value: inStock,     color: 'text-green-600'  },
          { label: 'Low Stock',     value: lowStock,    color: 'text-amber-600'  },
          { label: 'Out of Stock',  value: outOfStock,  color: 'text-red-600'    },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-3 text-center">
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
            const wa       = sv !== 'success' ? reorderLink(p) : null
            const isHistoryOpen = historyId === p.id
            return (
              <div key={p.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4">
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
                  <button
                    onClick={() => setAdjustingProduct(p)}
                    className="text-2xl font-bold text-gray-900 hover:text-indigo-600 transition-colors"
                    title="Adjust stock"
                  >
                    {p.available}
                  </button>
                  <div className="text-xs text-gray-500 space-y-0.5">
                    <div>reserved: {p.reserved}</div>
                    <div>reorder at: {p.minimumStock}</div>
                  </div>
                </div>

                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{p.available} available of {p.stock} total</p>

                <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-gray-50">
                  <button
                    onClick={() => setAdjustingProduct(p)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />Adjust
                  </button>
                  <button
                    onClick={() => setHistoryId(isHistoryOpen ? null : p.id)}
                    className="text-xs font-semibold text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
                  >
                    History {isHistoryOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {wa && (
                    <a
                      href={wa} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 ml-auto"
                    >
                      <MessageSquare className="w-3 h-3" />Reorder via WhatsApp
                    </a>
                  )}
                  {!wa && sv !== 'success' && (
                    <button
                      onClick={() => onAskAI(`Draft a restock message for ${p.name} — we're down to ${p.available} units, reorder point is ${p.minimumStock}`)}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 inline-flex items-center gap-1 ml-auto"
                    >
                      <Sparkles className="w-3 h-3" />Ask AI to draft reorder
                    </button>
                  )}
                </div>

                {isHistoryOpen && (
                  <div className="mt-3 pt-3 border-t border-gray-50">
                    <MovementHistory productId={p.id} token={token} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {adjustingProduct && (
        <StockAdjustModal
          product={adjustingProduct}
          token={token}
          onClose={() => setAdjustingProduct(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}

// ─── Pricing Module ───────────────────────────────────────────────────────────

function PricingModule({ token, onAskAI }: { token: string | undefined; onAskAI: (prompt: string) => void }) {
  const { data: productsData, loading: productsLoading, refetch } = useApi<{ products: Product[] }>(
    token ? '/api/products' : null, token,
  )
  const { data: pricingRulesData, loading: rulesLoading } = useApi<{ facts: BusinessFact[] }>(
    token ? '/api/business-facts?category=pricing' : null, token,
  )
  const { data: insights } = useApi<StudioInsights>(token ? '/api/studio/insights' : null, token)
  const { addToast } = useToast()

  const products     = productsData?.products   ?? []
  const pricingRules = pricingRulesData?.facts  ?? []

  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [savingId,    setSavingId]    = useState<string | null>(null)
  const [editFields,  setEditFields]  = useState<Record<string, string>>({})

  const selectedProduct = products.find(p => p.id === selectedId) ?? null

  function openDetail(p: Product) {
    setSelectedId(p.id)
    setEditFields({
      sellingPrice:   (p.sellingPrice    ?? 0).toString(),
      purchaseCost:   (p.purchaseCost    ?? 0).toString(),
      minPrice:       (p.minPrice        ?? '').toString(),
      maxPrice:       (p.maxPrice        ?? '').toString(),
      discountMinPct: (p.discountMinPct  ?? 0).toString(),
      discountMaxPct: (p.discountMaxPct  ?? 0).toString(),
    })
  }

  async function saveDetail() {
    if (!selectedId) return
    setSavingId(selectedId)
    try {
      const patch: Record<string, number | null> = {}
      if (editFields.sellingPrice !== '') patch.sellingPrice = parseFloat(editFields.sellingPrice)
      if (editFields.purchaseCost !== '') patch.purchaseCost = parseFloat(editFields.purchaseCost)
      patch.minPrice       = editFields.minPrice       ? parseFloat(editFields.minPrice)       : null
      patch.maxPrice       = editFields.maxPrice       ? parseFloat(editFields.maxPrice)       : null
      patch.discountMinPct = editFields.discountMinPct ? parseFloat(editFields.discountMinPct) : 0
      patch.discountMaxPct = editFields.discountMaxPct ? parseFloat(editFields.discountMaxPct) : 0

      await apiClient(`/api/products/${selectedId}`, {
        method: 'PATCH', token,
        body: JSON.stringify(patch),
      })
      addToast({ variant: 'success', title: 'Pricing saved' })
      setSelectedId(null)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to save' })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {insights && insights.thinMargin.length > 0 && (
        <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-rose-50 to-white border border-rose-100 shadow-sm shadow-rose-100/70 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-rose-100 flex items-center justify-center shrink-0">
              <TrendingUp className="w-4.5 h-4.5 text-rose-600 rotate-180" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {insights.thinMargin.length} product{insights.thinMargin.length !== 1 ? 's have' : ' has'} thin margins
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {insights.thinMargin.slice(0, 3).map(p => `${p.name} (${p.marginPct}%)`).join(', ')}
                {insights.thinMargin.length > 3 ? ` +${insights.thinMargin.length - 3} more` : ''} — under 15% margin.
              </p>
              <button
                onClick={() => onAskAI(`Should I raise prices on these thin-margin products: ${insights.thinMargin.map(p => p.name).join(', ')}?`)}
                className="mt-2 text-xs font-bold text-rose-700 hover:text-rose-800 inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />Ask AI about pricing
              </button>
            </div>
          </div>
        </div>
      )}

      {productsLoading ? (
        <SkeletonCard />
      ) : products.length === 0 ? (
        <EmptyState title="No products to price" description="Add items to your catalog first." />
      ) : (
        <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Cost', 'Selling Price', 'Margin %', 'Discount Range', 'Floor / Ceiling', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {products.map(p => {
                  const margin = calcMargin(p.sellingPrice, p.purchaseCost)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => openDetail(p)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{p.name}</p>
                        {p.category && <p className="text-xs text-gray-400">{p.category}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatCurrency(p.purchaseCost, p.currency)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{formatCurrency(p.sellingPrice, p.currency)}</td>
                      <td className="px-4 py-3">
                        {margin != null
                          ? <span className={`font-semibold ${marginColor(margin)}`}>{margin.toFixed(1)}%</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-amber-700 text-xs font-medium">
                        {p.discountMinPct > 0 || p.discountMaxPct > 0
                          ? `${p.discountMinPct}% – ${p.discountMaxPct}%`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {p.minPrice != null || p.maxPrice != null
                          ? `${formatCurrency(p.minPrice, p.currency)} – ${formatCurrency(p.maxPrice, p.currency)}`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={e => { e.stopPropagation(); openDetail(p) }}
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

      {/* Pricing Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedId(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">{selectedProduct.name}</h3>
                <p className="text-xs text-gray-500 mt-0.5">Edit pricing &amp; AI negotiation parameters</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Purchase Cost</label>
                <input
                  type="number" min="0" step="0.01"
                  value={editFields.purchaseCost}
                  onChange={e => setEditFields(f => ({ ...f, purchaseCost: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Selling Price</label>
                <input
                  type="number" min="0" step="0.01"
                  value={editFields.sellingPrice}
                  onChange={e => setEditFields(f => ({ ...f, sellingPrice: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                AI Negotiation Parameters
              </p>
              <p className="text-xs text-amber-700">Set the range AI can use when negotiating price autonomously in WhatsApp conversations.</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Floor Price (min)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editFields.minPrice}
                    onChange={e => setEditFields(f => ({ ...f, minPrice: e.target.value }))}
                    placeholder="Lowest AI can go"
                    className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Ceiling Price (max)</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={editFields.maxPrice}
                    onChange={e => setEditFields(f => ({ ...f, maxPrice: e.target.value }))}
                    placeholder="Highest to quote"
                    className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Min Discount %</label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={editFields.discountMinPct}
                    onChange={e => setEditFields(f => ({ ...f, discountMinPct: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Max Discount %</label>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    value={editFields.discountMaxPct}
                    onChange={e => setEditFields(f => ({ ...f, discountMaxPct: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedId(null)}>Cancel</Button>
              <Button onClick={saveDetail} disabled={savingId === selectedProduct.id}>
                {savingId === selectedProduct.id ? <RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> : <Check className="w-4 h-4 mr-1.5" />}
                Save pricing
              </Button>
            </div>
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

// Products a supplier can source, with per-supplier cost/lead-time/minimum
// qty (Business OS Phase B, docs/BUSINESS_OS_PLAN.md §8.2) — a product can
// have more than one supplier at different prices, which the single
// products.supplierId FK can't express.
function SupplierProductsPanel({ token, supplierId }: { token: string | undefined; supplierId: string }) {
  const { data, refetch } = useApi<{ supplierProducts: SupplierProduct[] }>(
    token ? `/api/suppliers/${supplierId}/products` : null, token,
  )
  const { data: productsData } = useApi<{ products: Product[] }>(token ? '/api/products' : null, token)
  const { addToast } = useToast()
  const supplierProducts = data?.supplierProducts ?? []
  const products = productsData?.products ?? []
  const linkedIds = new Set(supplierProducts.map(sp => sp.productId))

  const [showLink, setShowLink] = useState(false)
  const [form, setForm] = useState({ productId: '', cost: '', leadTimeDays: '', minimumQty: '' })
  const [saving, setSaving] = useState(false)

  async function linkProduct(e: React.FormEvent) {
    e.preventDefault()
    if (!form.productId) return
    setSaving(true)
    try {
      await apiClient(`/api/suppliers/${supplierId}/products/${form.productId}`, {
        method: 'PUT', token,
        body: JSON.stringify({
          cost: form.cost ? parseFloat(form.cost) : null,
          leadTimeDays: form.leadTimeDays ? parseInt(form.leadTimeDays, 10) : null,
          minimumQty: form.minimumQty ? parseInt(form.minimumQty, 10) : null,
        }),
      })
      setForm({ productId: '', cost: '', leadTimeDays: '', minimumQty: '' })
      setShowLink(false)
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to link product' })
    } finally {
      setSaving(false)
    }
  }

  async function unlinkProduct(productId: string) {
    try {
      await apiClient(`/api/suppliers/${supplierId}/products/${productId}`, { method: 'DELETE', token })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to remove' })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">Products supplied</p>
        <button onClick={() => setShowLink(v => !v)} className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
          + Link product
        </button>
      </div>

      {showLink && (
        <form onSubmit={linkProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 rounded-lg p-2.5 mb-2">
          <select
            required
            value={form.productId}
            onChange={e => setForm(f => ({ ...f, productId: e.target.value }))}
            className="col-span-2 sm:col-span-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Product...</option>
            {products.filter(p => !linkedIds.has(p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input
            type="number" min="0" step="0.01" placeholder="Cost"
            value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="number" min="0" placeholder="Lead days"
            value={form.leadTimeDays} onChange={e => setForm(f => ({ ...f, leadTimeDays: e.target.value }))}
            className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex gap-1">
            <input
              type="number" min="1" placeholder="Min qty"
              value={form.minimumQty} onChange={e => setForm(f => ({ ...f, minimumQty: e.target.value }))}
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button type="submit" size="sm" disabled={saving}><Check className="w-3.5 h-3.5" /></Button>
          </div>
        </form>
      )}

      {supplierProducts.length === 0 ? (
        <p className="text-xs text-gray-400">No products linked to this supplier yet.</p>
      ) : (
        <div className="rounded-lg border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {supplierProducts.map(sp => (
            <div key={sp.productId} className="flex items-center gap-2 px-3 py-2 text-xs">
              <span className="flex-1 truncate text-gray-700">{sp.productName}</span>
              {sp.cost != null && <span className="text-gray-500">{formatCurrency(sp.cost, 'USD')}</span>}
              {sp.leadTimeDays != null && <span className="text-gray-400">{sp.leadTimeDays}d</span>}
              <button onClick={() => unlinkProduct(sp.productId)} className="p-1 rounded hover:bg-gray-100 text-red-400">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const PO_STATUS_META: Record<string, { label: string; variant: 'default' | 'info' | 'success' | 'warning' }> = {
  draft:    { label: 'Draft',    variant: 'default' },
  sent:     { label: 'Ordered',  variant: 'info' },
  accepted: { label: 'Received', variant: 'success' },
}

// Purchase order documents (Business OS Phase B, §8.3) — reuses the shared
// `documents` table (document_type = 'purchase_order') via the generic
// GET /api/documents?type= list endpoint, plus the dedicated approve/receive
// workflow endpoints in purchase-orders.ts.
function PurchaseOrdersSection({ token }: { token: string | undefined }) {
  const { data, loading, refetch } = useApi<{ documents: PurchaseOrderDoc[] }>(
    token ? '/api/documents?type=purchase_order' : null, token,
  )
  const { addToast } = useToast()
  const orders = data?.documents ?? []
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  async function approve(id: string) {
    setBusyId(id)
    try {
      await apiClient(`/api/purchase-orders/${id}/approve`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Purchase order sent' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to approve' })
    } finally {
      setBusyId(null)
    }
  }

  async function receive(id: string) {
    setBusyId(id)
    try {
      await apiClient(`/api/purchase-orders/${id}/receive`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'Marked as received — stock updated' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to mark received' })
    } finally {
      setBusyId(null)
    }
  }

  if (!loading && orders.length === 0) return null

  return (
    <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-900">Purchase Orders</p>
      {loading ? (
        <SkeletonCard />
      ) : (
        <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {orders.map(po => {
            const meta = PO_STATUS_META[po.status] ?? { label: po.status, variant: 'default' as const }
            const isExpanded = expandedId === po.id
            return (
              <div key={po.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : po.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{po.documentNumber} — {po.structuredData?.supplierName ?? 'Supplier'}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(po.totalCents / 100, po.currency)}</p>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    {(po.structuredData?.items ?? []).map((item, i) => (
                      <div key={i} className="flex justify-between text-xs text-gray-600">
                        <span>{item.quantity}× {item.description}</span>
                        <span>{formatCurrency((item.unitPriceCents * item.quantity) / 100, po.currency)}</span>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      {po.status === 'draft' && (
                        <Button size="sm" onClick={() => approve(po.id)} disabled={busyId === po.id}>
                          {busyId === po.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                          Approve & Send
                        </Button>
                      )}
                      {po.status === 'sent' && (
                        <Button size="sm" onClick={() => receive(po.id)} disabled={busyId === po.id}>
                          {busyId === po.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Check className="w-3.5 h-3.5 mr-1" />}
                          Mark Received
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

function SuppliersModule({ token, onAskAI }: { token: string | undefined; onAskAI: (prompt: string) => void }) {
  const { data: suppliersData, loading, refetch } = useApi<{ suppliers: Supplier[] }>(
    token ? '/api/suppliers' : null, token,
  )
  const { data: insights, refetch: refetchInsights } = useApi<StudioInsights>(token ? '/api/studio/insights' : null, token)
  const { addToast } = useToast()
  const suppliers = suppliersData?.suppliers ?? []

  const [creatingPOFor, setCreatingPOFor] = useState<string | null>(null)

  async function createAndApprovePO(suggestion: StudioInsights['suggestedPurchaseOrders'][number]) {
    setCreatingPOFor(suggestion.productId)
    try {
      await apiClient('/api/purchase-orders', {
        method: 'POST', token,
        body: JSON.stringify({
          supplierId: suggestion.supplierId,
          items: [{ productId: suggestion.productId, quantity: suggestion.quantity }],
          autoApprove: true,
        }),
      })
      addToast({ variant: 'success', title: `Purchase order sent to ${suggestion.supplierName}` })
      refetchInsights()
    } catch (err: any) {
      addToast({ variant: 'error', title: err.message ?? 'Failed to create purchase order' })
    } finally {
      setCreatingPOFor(null)
    }
  }

  const [showAdd,       setShowAdd]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [expandedId,    setExpandedId]    = useState<string | null>(null)
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
      {insights && insights.suggestedPurchaseOrders.length > 0 && (
        <div className="rounded-[1.75rem] border border-indigo-100 bg-white shadow-sm shadow-indigo-100/70 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <Truck className="w-4 h-4 text-indigo-500" />
            Suggested reorders
          </p>
          <div className="space-y-2">
            {insights.suggestedPurchaseOrders.map(sug => (
              <div key={sug.productId} className="flex items-center justify-between gap-3 rounded-xl bg-indigo-50/60 ring-1 ring-indigo-100 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {sug.quantity}× {sug.productName}
                  </p>
                  <p className="text-xs text-gray-500">
                    from {sug.supplierName}
                    {sug.unitCost != null && ` · ${formatCurrency(sug.estimatedCost, 'USD')} est.`}
                    {sug.leadTimeDays != null && ` · ${sug.leadTimeDays}d lead time`}
                  </p>
                </div>
                <Button size="sm" onClick={() => createAndApprovePO(sug)} disabled={creatingPOFor === sug.productId}>
                  {creatingPOFor === sug.productId
                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                    : <Check className="w-3.5 h-3.5 mr-1" />}
                  Create & Send PO
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <PurchaseOrdersSection token={token} />

      {insights && insights.supplierFlags.length > 0 && (
        <div className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-white via-orange-50 to-white border border-orange-100 shadow-sm shadow-orange-100/70 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl bg-orange-100 flex items-center justify-center shrink-0">
              <Truck className="w-4.5 h-4.5 text-orange-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {insights.supplierFlags.length} supplier{insights.supplierFlags.length !== 1 ? 's need' : ' needs'} attention
              </p>
              <p className="text-xs text-gray-600 mt-1">
                {insights.supplierFlags.slice(0, 3).map(s => s.flag === 'low_reliability'
                  ? `${s.company} (${s.reliabilityScore}% reliable)`
                  : `${s.company} (${s.averageDeliveryTime}d delivery)`).join(', ')}
                {insights.supplierFlags.length > 3 ? ` +${insights.supplierFlags.length - 3} more` : ''}
              </p>
              <button
                onClick={() => onAskAI(`Which of these suppliers should I consider replacing or renegotiating with, and why: ${insights.supplierFlags.map(s => s.company).join(', ')}?`)}
                className="mt-2 text-xs font-bold text-orange-700 hover:text-orange-800 inline-flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" />Ask AI about suppliers
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setShowAdd(v => !v)}>
          <Plus className="w-4 h-4 mr-1.5" />
          Add supplier
        </Button>
      </div>

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-[1.75rem] border border-indigo-200 shadow-sm shadow-indigo-100/70 p-4 space-y-4">
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
            const isExpanded = expandedId === s.id
            return (
              <div key={s.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <button
                      className="flex-1 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                    >
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
                    </button>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : s.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                      {deleteConfirm === s.id ? (
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="text-gray-500 text-xs">Delete?</span>
                          <button onClick={() => handleDelete(s.id)} className="text-red-600 text-xs font-medium hover:underline">Yes</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-gray-500 text-xs hover:underline">No</button>
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

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-4">
                    {s.notes && <p className="text-sm text-gray-600 italic">{s.notes}</p>}

                    {/* Contact actions */}
                    <div className="flex flex-wrap gap-2">
                      {s.phone && (
                        <a
                          href={`tel:${s.phone}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5 text-gray-500" />
                          {s.phone}
                        </a>
                      )}
                      {s.whatsapp && (
                        <a
                          href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 hover:bg-green-100 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          WhatsApp
                        </a>
                      )}
                      {s.email && (
                        <a
                          href={`mailto:${s.email}`}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-sm text-indigo-700 hover:bg-indigo-100 transition-colors"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          {s.email}
                        </a>
                      )}
                    </div>

                    {/* Full detail grid */}
                    <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 rounded-lg p-3">
                      {s.contact && <div><span className="text-gray-400">Contact person:</span> <span className="font-medium text-gray-700">{s.contact}</span></div>}
                      <div><span className="text-gray-400">Avg delivery:</span> <span className="font-medium text-gray-700">{s.averageDeliveryTime} days</span></div>
                      <div><span className="text-gray-400">Reliability:</span> <span className="font-medium text-gray-700">{s.reliabilityScore}/100</span></div>
                      {s.minimumOrder > 0 && <div><span className="text-gray-400">Min order:</span> <span className="font-medium text-gray-700">${s.minimumOrder}</span></div>}
                      {s.paymentTerms && <div><span className="text-gray-400">Payment:</span> <span className="font-medium text-gray-700">{s.paymentTerms}</span></div>}
                      {s.outstandingBalance > 0 && <div><span className="text-gray-400">Outstanding:</span> <span className="font-medium text-red-600">${s.outstandingBalance}</span></div>}
                    </div>

                    <SupplierProductsPanel token={token} supplierId={s.id} />
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
            <div key={rule.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4 flex items-start gap-3">
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
  const { data: profile, loading, refetch } = useApi<BusinessProfile>(
    token ? '/api/business-profile' : null, token,
  )
  const { addToast } = useToast()

  const [editing,       setEditing]       = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    companyName:   '',
    tagline:       '',
    industry:      '',
    themeColor:    '#4F46E5',
    accentColor:   '#818CF8',
    brandVoice:    '',
    companyValues: '',
    address:       '',
    phone:         '',
    email:         '',
    website:       '',
    footerText:    '',
    defaultTerms:  '',
    paymentInstructions: '',
    defaultCurrency: 'ZMW',
    defaultTaxRate:  0,
  })

  useEffect(() => {
    if (profile) {
      setForm({
        companyName:         profile.companyName         ?? '',
        tagline:             profile.tagline             ?? '',
        industry:            profile.industry            ?? '',
        themeColor:          profile.themeColor          ?? '#4F46E5',
        accentColor:         profile.accentColor         ?? '#818CF8',
        brandVoice:          profile.brandVoice          ?? '',
        companyValues:       profile.companyValues       ?? '',
        address:             profile.address             ?? '',
        phone:               profile.phone               ?? '',
        email:               profile.email               ?? '',
        website:             profile.website             ?? '',
        footerText:          profile.footerText          ?? '',
        defaultTerms:        profile.defaultTerms        ?? '',
        paymentInstructions: profile.paymentInstructions ?? '',
        defaultCurrency:     profile.defaultCurrency     ?? 'ZMW',
        defaultTaxRate:      profile.defaultTaxRate       ?? 0,
      })
    }
  }, [profile])

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !profile?.id) return
    setUploadingLogo(true)
    try {
      const { uploadBrandLogo } = await import('@/lib/storage')
      const url = await uploadBrandLogo(profile.id, file)
      await apiClient('/api/business-profile', {
        method: 'PUT', token,
        body: JSON.stringify({ logoUrl: url }),
      })
      addToast({ variant: 'success', title: 'Logo uploaded' })
      refetch()
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Logo upload failed', description: err.message ?? 'Check Supabase bucket policies allow INSERT.' })
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await apiClient('/api/business-profile', { method: 'PUT', token, body: JSON.stringify(form) })
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
      {/* Logo + identity card (always visible) */}
      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Logo with upload overlay */}
            <div className="relative group">
              {profile?.logoUrl ? (
                <img src={profile.logoUrl} alt="Logo" className="w-20 h-20 rounded-xl object-contain border border-gray-200 bg-gray-50" />
              ) : (
                <div
                  className="w-20 h-20 rounded-xl flex items-center justify-center text-white text-2xl font-bold"
                  style={{ background: profile?.themeColor ?? '#4F46E5' }}
                >
                  {(profile?.companyName ?? 'B')[0]?.toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-medium"
              >
                {uploadingLogo ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Palette className="w-4 h-4" />}
              </button>
              <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{profile?.companyName ?? 'Untitled Business'}</h2>
              {profile?.tagline  && <p className="text-sm text-gray-500 mt-0.5">{profile.tagline}</p>}
              {profile?.industry && <Badge variant="info" className="mt-2">{profile.industry}</Badge>}
              <p className="text-xs text-gray-400 mt-1">Click logo to change</p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => setEditing(e => !e)}>
            <Edit2 className="w-4 h-4 mr-1.5" />
            {editing ? 'Cancel' : 'Edit Brand'}
          </Button>
        </div>

        {!editing && profile && (
          <>
            {(profile.brandVoice || profile.companyValues) && (
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                {profile.brandVoice && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Brand Voice</p>
                    <p className="text-sm text-gray-700">{profile.brandVoice}</p>
                  </div>
                )}
                {profile.companyValues && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Company Values</p>
                    <p className="text-sm text-gray-700">{profile.companyValues}</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3 items-center pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">Brand colors:</p>
              {[profile.themeColor, profile.accentColor].filter(Boolean).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-5 h-5 rounded-full border border-gray-200 shadow-sm" style={{ background: c! }} />
                  <span className="text-xs text-gray-400 font-mono">{c}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <form onSubmit={handleSave} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-6 space-y-5">
          <p className="font-semibold text-gray-900">Edit Brand Profile</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Business Name</label>
              <input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="Acme Ltd" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tagline</label>
              <input value={form.tagline} onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))} placeholder="Building the future of..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Industry</label>
              <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Technology, Retail, Services..." className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Default Currency</label>
              <input value={form.defaultCurrency} onChange={e => setForm(f => ({ ...f, defaultCurrency: e.target.value.toUpperCase() }))} placeholder="ZMW" maxLength={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Phone</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+260 97 000 0000" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Email</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="hello@business.com" type="email" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Website</label>
              <input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://business.com" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tax Rate (%)</label>
              <input value={form.defaultTaxRate} onChange={e => setForm(f => ({ ...f, defaultTaxRate: Number(e.target.value) }))} type="number" min={0} max={100} step={0.5} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Primary Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.themeColor} onChange={e => setForm(f => ({ ...f, themeColor: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1" />
                  <span className="text-xs text-gray-400 font-mono">{form.themeColor}</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Accent Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-1" />
                  <span className="text-xs text-gray-400 font-mono">{form.accentColor}</span>
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Address</label>
              <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="123 Main St, Lusaka, Zambia" rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Brand Voice</label>
              <textarea value={form.brandVoice} onChange={e => setForm(f => ({ ...f, brandVoice: e.target.value }))} placeholder="Professional but approachable. We avoid jargon and speak plainly..." rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Company Values</label>
              <textarea value={form.companyValues} onChange={e => setForm(f => ({ ...f, companyValues: e.target.value }))} placeholder="Customer first. Quality over speed. Transparency in all dealings..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Default Payment Instructions</label>
              <textarea value={form.paymentInstructions} onChange={e => setForm(f => ({ ...f, paymentInstructions: e.target.value }))} placeholder="Bank transfer: ABC Bank, Account 1234567..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-gray-500 mb-1">Default Document Terms</label>
              <textarea value={form.defaultTerms} onChange={e => setForm(f => ({ ...f, defaultTerms: e.target.value }))} placeholder="Payment due within 30 days. Late fees may apply..." rows={2} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button>
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

      <div className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4">
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
                <div key={p.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 overflow-hidden">
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
              <div key={post.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4">
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

// ─── Social Module ────────────────────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Globe,
    desc: 'Post to your Facebook Page and reach your audience.',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    icon: AtSign,
    desc: 'Share photos and reels to grow your brand.',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: 'text-gray-900',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: Film,
    desc: 'Create short-form video content for TikTok.',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: Tv2,
    desc: 'Upload videos and manage your channel.',
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    color: 'text-gray-900',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: MessageSquare,
    desc: 'Engage your audience with posts and threads.',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Building2,
    desc: 'Reach professionals and business decision-makers.',
  },
]

function SocialModule({ token: _token }: { token: string | undefined }) {
  const { data: accountsData } = useApi<{ accounts: SocialAccount[] }>(
    _token ? '/api/social-accounts' : null, _token,
  )
  const accounts = accountsData?.accounts ?? []

  function isConnected(platformId: string) {
    return accounts.some(a => a.platform === platformId && a.connected)
  }

  function getHandle(platformId: string) {
    return accounts.find(a => a.platform === platformId)?.username
  }

  return (
    <div className="space-y-6">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-indigo-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-indigo-800">Social Media Integrations</p>
            <p className="text-xs text-indigo-600 mt-1">
              Connect your social accounts so Zuri can publish AI-generated content, track engagement, and keep your brand consistent across all platforms.
              OAuth setup is required — connections will open in a new tab.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SOCIAL_PLATFORMS.map(({ id, name, color, bg, border, icon: Icon, desc }) => {
          const connected = isConnected(id)
          const handle = getHandle(id)
          return (
            <div key={id} className={`bg-white rounded-xl border ${border} shadow-sm p-4`}>
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{name}</p>
                    {connected && (
                      <Badge variant="success">Connected</Badge>
                    )}
                  </div>
                  {handle && <p className="text-xs text-gray-500 mt-0.5">@{handle}</p>}
                  {!connected && <p className="text-xs text-gray-500 mt-1">{desc}</p>}
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {connected ? (
                  <>
                    <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      View page
                    </button>
                    <span className="text-gray-200">|</span>
                    <button className="text-xs text-red-500 hover:text-red-700">Disconnect</button>
                  </>
                ) : (
                  <button
                    className={`text-xs font-medium ${color} ${bg} border ${border} px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity flex items-center gap-1.5`}
                    onClick={() => alert(`${name} OAuth connection coming soon. This will open an authorization flow.`)}
                  >
                    <Link2 className="w-3 h-3" />
                    Connect {name}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
        <p className="text-xs font-medium text-gray-700 mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          What Zuri will do with connected accounts
        </p>
        <ul className="text-xs text-gray-600 space-y-1.5">
          {[
            'Auto-publish AI-generated product marketing content on schedule',
            'Import your follower and engagement data into relationship intelligence',
            'Generate platform-optimized captions, hashtags, and call-to-actions',
            'Alert you when posts are performing unusually well or getting negative engagement',
            'Cross-post WhatsApp catalog items to Instagram and Facebook shops',
          ].map(item => (
            <li key={item} className="flex items-start gap-1.5">
              <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
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
  // Lets any tab's "Ask AI" insight jump to the Overview chat with a
  // pre-filled question instead of duplicating LLM calls per tab.
  const [askPrompt, setAskPrompt] = useState<string | null>(null)
  const onAskAI = (prompt: string) => { setAskPrompt(prompt); setActiveModule('overview') }

  function renderModule() {
    switch (activeModule) {
      case 'overview':  return <OverviewModule  token={token} initialPrompt={askPrompt} onConsumedPrompt={() => setAskPrompt(null)} />
      case 'catalog':   return <CatalogModule   token={token} />
      case 'inventory': return <InventoryModule  token={token} onAskAI={onAskAI} />
      case 'pricing':   return <PricingModule    token={token} onAskAI={onAskAI} />
      case 'suppliers': return <SuppliersModule  token={token} onAskAI={onAskAI} />
      case 'rules':     return <RulesModule      token={token} />
      case 'brand':     return <BrandModule      token={token} />
      case 'knowledge': return <KnowledgeModule  token={token} />
      case 'marketing': return <MarketingModule  token={token} />
      case 'social':    return <SocialModule     token={token} />
      default:          return null
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)] pt-14 pb-14 md:pt-0 md:pb-0">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <PageHeader
          title="Business Knowledge Hub"
          description="Single source of truth for your business data — feeds Zuri's AI intelligence engines."
        />

        {/* Module Tab Bar */}
        <div className="sticky top-0 z-10 overflow-x-auto rounded-2xl border border-slate-100 bg-white/90 backdrop-blur-xl p-2 shadow-sm">
          <div className="flex min-w-max gap-1.5">
            {MODULES.map(({ id, label, Icon }) => {
              const isActive = activeModule === id
              return (
                <button
                  key={id}
                  onClick={() => setActiveModule(id)}
                  className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-2xl px-3.5 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
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
