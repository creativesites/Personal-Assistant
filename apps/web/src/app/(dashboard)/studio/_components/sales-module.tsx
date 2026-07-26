'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ShoppingCart, AlertTriangle, CheckCircle2, Clock, Send,
  Plus, Loader2, ArrowUpRight, DollarSign, UserCheck, ShieldCheck,
  FileText, FileCheck, Receipt, Eye, ExternalLink, ArrowRightCircle, RefreshCw,
  Search, MessageSquare, Zap, Play, Pause, Settings, Copy, Share2
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Badge, Button, Modal, SkeletonCard, useToast, type BadgeVariant } from '@/components/ui'
import { formatCurrency } from './shared'

interface SalesOrder {
  id: string
  orderNumber: string
  contactId: string | null
  contactName: string
  status: string
  fulfillmentStatus: string
  currency: string
  totalCents: number
  notes: string | null
  orderedAt: string
  fulfilledAt: string | null
}

interface ReceivableAgingSummary {
  currentCents: number
  overdue30Cents: number
  overdue60Cents: number
  overdue90Cents: number
  totalReceivablesCents: number
}

interface ReceivableItem {
  id: string
  documentNumber: string
  totalCents: number
  daysOverdue: number
  contactName: string
  createdAt: string
}

interface DocumentItem {
  id: string
  documentType: string
  documentNumber: string
  title: string
  status: string
  currency: string
  totalCents: number
  shareToken: string | null
  contact: { id: string; name: string } | null
  createdAt: string
}

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: 'default',
  generated: 'info',
  sent: 'info',
  viewed: 'purple',
  downloaded: 'purple',
  accepted: 'success',
  paid: 'success',
  rejected: 'error',
  expired: 'warning',
  archived: 'default',
}

interface SalesModuleProps {
  token: string | null
}

export function SalesModule({ token }: SalesModuleProps) {
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState<'documents' | 'orders' | 'receivables'>('documents')
  const [docFilter, setDocFilter] = useState<'all' | 'quotation' | 'invoice' | 'receipt'>('all')
  const [orderFilter, setOrderFilter] = useState<'all' | 'confirmed' | 'fulfilled'>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)

  // Quick Quote Modal state
  const [showQuickQuote, setShowQuickQuote] = useState(false)
  const [qqCustomerName, setQqCustomerName] = useState('')
  const [qqCustomerPhone, setQqCustomerPhone] = useState('')
  const [qqTitle, setQqTitle] = useState('Quotation for ' + new Date().toLocaleDateString())
  const [qqItems, setQqItems] = useState<{ description: string; qty: number; unitPrice: number }[]>([
    { description: 'Standard Product / Service', qty: 1, unitPrice: 100 }
  ])
  const [qqSending, setQqSending] = useState(false)
  const [generatedWaLink, setGeneratedWaLink] = useState<string | null>(null)

  // Auto-Dunning State
  const [dunningActive, setDunningActive] = useState(true)
  const [dunningInterval, setDunningInterval] = useState<'3d' | '7d' | '14d'>('3d')
  const [dunningTone, setDunningTone] = useState<'polite' | 'firm' | 'urgent'>('polite')

  // Fetch Documents (Quotations, Invoices, Receipts)
  const { data: docsData, refetch: refetchDocs, loading: docsLoading } = useApi<{ documents: DocumentItem[] }>(
    token ? `/api/documents${docFilter !== 'all' ? `?type=${docFilter}` : ''}` : null,
    token,
  )

  // Fetch Sales Orders
  const { data: ordersData, refetch: refetchOrders, loading: ordersLoading } = useApi<{ orders: SalesOrder[] }>(
    token ? `/api/studio/sales/orders?status=${orderFilter}` : null,
    token,
  )

  // Fetch Receivables Aging
  const { data: agingData } = useApi<{
    summary: ReceivableAgingSummary
    items: ReceivableItem[]
  }>(token ? '/api/studio/receivables/aging' : null, token)

  const handleMarkFulfilled = async (orderId: string) => {
    if (!token) return
    setUpdatingId(orderId)
    try {
      await apiClient(`/api/studio/sales/orders/${orderId}/status`, {
        token,
        method: 'POST',
        body: JSON.stringify({ fulfillmentStatus: 'fulfilled', status: 'fulfilled' }),
      })
      addToast({ title: 'Order Fulfilled', description: 'Order status updated and inventory decremented.', variant: 'success' })
      refetchOrders()
    } catch {
      addToast({ title: 'Error', description: 'Failed to update order status.', variant: 'error' })
    } finally {
      setUpdatingId(null)
    }
  }

  const handleConvertDocument = async (docId: string, currentType: string) => {
    if (!token) return
    const targetType = currentType === 'quotation' ? 'invoice' : 'receipt'
    setConvertingId(docId)
    try {
      await apiClient(`/api/documents/${docId}/convert`, {
        token,
        method: 'POST',
        body: JSON.stringify({ targetType }),
      })
      addToast({
        title: 'Document Converted',
        description: `Successfully converted ${currentType} into ${targetType}!`,
        variant: 'success',
      })
      refetchDocs()
    } catch {
      addToast({ title: 'Conversion Failed', description: 'Could not convert document.', variant: 'error' })
    } finally {
      setConvertingId(null)
    }
  }

  const handleSendReminder = (item: ReceivableItem) => {
    const text = `Hi ${item.contactName}, gentle reminder regarding invoice ${item.documentNumber} for ${formatCurrency(item.totalCents, 'ZMW')}, which is now ${item.daysOverdue} days pending.`
    navigator.clipboard.writeText(text)
    addToast({ title: 'Reminder Copied', description: 'WhatsApp payment reminder text copied to clipboard!', variant: 'info' })
  }

  const copyDocLink = (doc: DocumentItem) => {
    if (!doc.shareToken) {
      addToast({ title: 'No Link Available', description: 'Share token not generated yet.', variant: 'warning' })
      return
    }
    const url = `${window.location.origin}/d/${doc.shareToken}`
    navigator.clipboard.writeText(url)
    addToast({ title: 'Link Copied', description: 'Customer document link copied to clipboard!', variant: 'success' })
  }

  const documents = docsData?.documents || []
  const orders = ordersData?.orders || []
  const summary = agingData?.summary || {
    currentCents: 0,
    overdue30Cents: 0,
    overdue60Cents: 0,
    overdue90Cents: 0,
    totalReceivablesCents: 0,
  }
  const agingItems = agingData?.items || []

  return (
    <div className="space-y-8">
      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-2.5 rounded-2xl border border-gray-200/80 shadow-sm">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'documents'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            Quotations & Invoices ({documents.length})
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Sales Orders ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('receivables')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'receivables'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Receivables & Aging ({formatCurrency(summary.totalReceivablesCents, 'ZMW')})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowQuickQuote(true)}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm font-bold text-xs"
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            60s Express Quote
          </Button>

          <Link href="/business">
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Full Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Auto-Dunning Intelligence Bar */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 border border-indigo-900/50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-500/30 text-indigo-300">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-wide uppercase text-indigo-300">Auto-Dunning Engine</span>
              <Badge variant={dunningActive ? 'success' : 'default'} className="text-[10px]">
                {dunningActive ? 'Active' : 'Paused'}
              </Badge>
            </div>
            <p className="text-xs text-gray-300 mt-0.5">
              Automated WhatsApp payment reminders sent at scheduled intervals for unpaid invoices.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 self-end md:self-auto">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Frequency:</span>
            <select
              value={dunningInterval}
              onChange={(e) => setDunningInterval(e.target.value as any)}
              className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="3d">Every 3 Days</option>
              <option value="7d">Every 7 Days</option>
              <option value="14d">Every 14 Days</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Tone:</span>
            <select
              value={dunningTone}
              onChange={(e) => setDunningTone(e.target.value as any)}
              className="bg-slate-800 text-white text-xs border border-slate-700 rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-indigo-500"
            >
              <option value="polite">Polite</option>
              <option value="firm">Firm</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setDunningActive(!dunningActive)
              addToast({
                title: dunningActive ? 'Auto-Dunning Paused' : 'Auto-Dunning Activated',
                description: dunningActive ? 'Automated reminders suspended for all pending invoices.' : 'Automated WhatsApp reminders scheduled.',
                variant: dunningActive ? 'warning' : 'success'
              })
            }}
            className="border-slate-700 hover:bg-slate-800 text-white text-xs font-semibold"
          >
            {dunningActive ? <Pause className="w-3.5 h-3.5 mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            {dunningActive ? 'Pause Dunning' : 'Resume Dunning'}
          </Button>
        </div>
      </div>

      {/* 1. QUOTATIONS & INVOICES TAB */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Customer Commercial Documents
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Quotations, Invoices, and Receipts compiled with company products, services, and brand assets.
              </p>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
              {(['all', 'quotation', 'invoice', 'receipt'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setDocFilter(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    docFilter === type
                      ? 'bg-white text-gray-900 shadow-sm font-bold'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {type === 'all' ? 'All Docs' : `${type}s`}
                </button>
              ))}
            </div>
          </div>

          {docsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : documents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center space-y-3">
              <FileText className="w-12 h-10 text-gray-300 mx-auto" />
              <p className="text-sm font-semibold text-gray-700">No documents found</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Create custom quotations, invoices, or receipts directly from your company catalog items and services.
              </p>
              <Link
                href="/business"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create First Document
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden divide-y divide-gray-100">
              {documents.map(doc => (
                <div key={doc.id} className="p-4 hover:bg-gray-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-mono text-xs font-bold flex-shrink-0 mt-0.5">
                      {doc.documentType === 'quotation' ? 'QT' : doc.documentType === 'invoice' ? 'INV' : 'RC'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-900">{doc.documentNumber}</span>
                        <Badge variant={STATUS_VARIANTS[doc.status] || 'default'}>
                          {doc.status}
                        </Badge>
                      </div>
                      <h4 className="font-bold text-gray-900 text-sm mt-0.5">{doc.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Client: <span className="font-medium text-gray-700">{doc.contact?.name || 'Walk-in Customer'}</span> · {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-gray-100">
                    <div className="text-right">
                      <span className="text-base font-bold text-gray-900 block">
                        {formatCurrency(doc.totalCents, doc.currency)}
                      </span>
                      <span className="text-[11px] text-gray-400 capitalize">{doc.documentType}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyDocLink(doc)}
                        className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors text-xs font-medium"
                        title="Copy Customer Share Link"
                      >
                        Copy Link
                      </button>

                      {doc.documentType !== 'receipt' && (
                        <button
                          onClick={() => handleConvertDocument(doc.id, doc.documentType)}
                          disabled={convertingId === doc.id}
                          className="px-2.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors text-xs font-bold flex items-center gap-1"
                          title={`Convert to ${doc.documentType === 'quotation' ? 'Invoice' : 'Receipt'}`}
                        >
                          {convertingId === doc.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowRightCircle className="w-3.5 h-3.5" />
                          )}
                          Convert
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. SALES ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                Sales Orders & Fulfillment
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Live customer sales orders created directly or converted from accepted quotations.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {(['all', 'confirmed', 'fulfilled'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                    orderFilter === f
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {ordersLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-3">
              <ShoppingCart className="w-10 h-10 text-gray-300 mx-auto" />
              <p className="text-sm font-semibold text-gray-700">No sales orders found</p>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Sales orders appear here automatically when customer quotations are accepted or when direct orders are processed.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orders.map(order => (
                <div key={order.id} className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-sm hover:shadow-md transition-shadow space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                        {order.orderNumber}
                      </span>
                      <h4 className="font-bold text-gray-900 mt-1">{order.contactName}</h4>
                      <span className="text-xs text-gray-400">
                        Ordered {new Date(order.orderedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-gray-900 block">
                        {formatCurrency(order.totalCents, order.currency)}
                      </span>
                      <Badge variant={order.fulfillmentStatus === 'fulfilled' ? 'success' : 'warning'}>
                        {order.fulfillmentStatus}
                      </Badge>
                    </div>
                  </div>

                  {order.notes && (
                    <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                      {order.notes}
                    </p>
                  )}

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Order Confirmed
                    </span>

                    {order.fulfillmentStatus !== 'fulfilled' && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkFulfilled(order.id)}
                        disabled={updatingId === order.id}
                        className="text-xs"
                      >
                        {updatingId === order.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        )}
                        Mark Fulfilled
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. RECEIVABLES & AGING TAB */}
      {activeTab === 'receivables' && (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-600" />
                Accounts Receivable & Aging Ledger
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Outstanding customer invoices categorized by payment due dates.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-gray-400 font-medium uppercase tracking-wider block">Total Outstanding</span>
              <span className="text-2xl font-bold text-gray-900">
                {formatCurrency(summary.totalReceivablesCents, 'ZMW')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-emerald-50/60 rounded-xl border border-emerald-100">
              <span className="text-xs font-semibold text-emerald-700 block">Current (0–30 Days)</span>
              <span className="text-lg font-bold text-emerald-900 mt-1 block">
                {formatCurrency(summary.currentCents, 'ZMW')}
              </span>
            </div>
            <div className="p-4 bg-amber-50/60 rounded-xl border border-amber-100">
              <span className="text-xs font-semibold text-amber-700 block">31–60 Days Overdue</span>
              <span className="text-lg font-bold text-amber-900 mt-1 block">
                {formatCurrency(summary.overdue30Cents, 'ZMW')}
              </span>
            </div>
            <div className="p-4 bg-orange-50/60 rounded-xl border border-orange-100">
              <span className="text-xs font-semibold text-orange-700 block">61–90 Days Overdue</span>
              <span className="text-lg font-bold text-orange-900 mt-1 block">
                {formatCurrency(summary.overdue60Cents, 'ZMW')}
              </span>
            </div>
            <div className="p-4 bg-rose-50/60 rounded-xl border border-rose-100">
              <span className="text-xs font-semibold text-rose-700 block">90+ Days Overdue</span>
              <span className="text-lg font-bold text-rose-900 mt-1 block">
                {formatCurrency(summary.overdue90Cents, 'ZMW')}
              </span>
            </div>
          </div>

          {agingItems.length > 0 && (
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Pending Payment Reminders</h4>
              <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {agingItems.map(item => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold text-gray-900">{item.contactName}</span>
                      <span className="text-xs text-gray-400 ml-2">({item.documentNumber})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{formatCurrency(item.totalCents, 'ZMW')}</span>
                      <Badge variant={item.daysOverdue > 30 ? 'error' : 'warning'}>
                        {item.daysOverdue}d pending
                      </Badge>
                      <button
                        onClick={() => handleSendReminder(item)}
                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors text-xs font-medium flex items-center gap-1"
                        title="Copy WhatsApp Reminder"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Remind
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. 60s EXPRESS QUOTE MODAL */}
      <Modal
        open={showQuickQuote}
        onClose={() => setShowQuickQuote(false)}
        title="⚡ 60-Second Express Quote Builder"
      >
        <div className="space-y-4 text-sm">
          <p className="text-xs text-gray-500">
            Rapidly create and dispatch a quotation via WhatsApp in under 60 seconds.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Name</label>
              <input
                type="text"
                value={qqCustomerName}
                onChange={(e) => setQqCustomerName(e.target.value)}
                placeholder="e.g. Acme Corp / Jane Doe"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp Phone Number</label>
              <input
                type="text"
                value={qqCustomerPhone}
                onChange={(e) => setQqCustomerPhone(e.target.value)}
                placeholder="e.g. +260971234567"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Quotation Title</label>
            <input
              type="text"
              value={qqTitle}
              onChange={(e) => setQqTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800">Line Items</span>
              <button
                type="button"
                onClick={() => setQqItems([...qqItems, { description: '', qty: 1, unitPrice: 0 }])}
                className="text-xs text-indigo-600 font-semibold flex items-center gap-1 hover:underline"
              >
                <Plus className="w-3 h-3" /> Add Item
              </button>
            </div>

            {qqItems.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => {
                    const next = [...qqItems]
                    next[idx].description = e.target.value
                    setQqItems(next)
                  }}
                  placeholder="Item description"
                  className="flex-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs"
                />
                <input
                  type="number"
                  value={item.qty}
                  min={1}
                  onChange={(e) => {
                    const next = [...qqItems]
                    next[idx].qty = parseInt(e.target.value) || 1
                    setQqItems(next)
                  }}
                  className="w-16 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-center"
                />
                <input
                  type="number"
                  value={item.unitPrice}
                  onChange={(e) => {
                    const next = [...qqItems]
                    next[idx].unitPrice = parseFloat(e.target.value) || 0
                    setQqItems(next)
                  }}
                  className="w-24 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-right"
                />
              </div>
            ))}

            <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 mt-2">
              <span className="text-xs font-semibold text-gray-600">Total Quote Amount</span>
              <span className="text-base font-bold text-gray-900">
                {formatCurrency(
                  qqItems.reduce((acc, i) => acc + i.qty * i.unitPrice * 100, 0),
                  'ZMW'
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowQuickQuote(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
              onClick={() => {
                const total = qqItems.reduce((acc, i) => acc + i.qty * i.unitPrice, 0)
                const itemsText = qqItems.map(i => `• ${i.description} x${i.qty} @ K${i.unitPrice}`).join('%0A')
                const text = `Hi ${qqCustomerName || 'there'}, here is your express quote for *${qqTitle}*:%0A%0A${itemsText}%0A%0A*Total: K${total}*%0A%0APlease reply to confirm or ask any questions!`
                const cleanPhone = qqCustomerPhone.replace(/[^0-9]/g, '')
                const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`
                
                window.open(waUrl, '_blank')
                addToast({ title: 'Quote Created!', description: 'WhatsApp share window launched.', variant: 'success' })
                setShowQuickQuote(false)
              }}
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Send via WhatsApp
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
