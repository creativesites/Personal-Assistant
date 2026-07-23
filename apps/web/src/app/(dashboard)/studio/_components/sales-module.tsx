'use client'

import { useState } from 'react'
import {
  ShoppingCart, AlertTriangle, CheckCircle2, Clock, Send,
  Plus, Loader2, ArrowUpRight, DollarSign, UserCheck, ShieldCheck,
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { Badge, Button, Modal, SkeletonCard, useToast } from '@/components/ui'
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

interface SalesModuleProps {
  token: string | null
}

export function SalesModule({ token }: SalesModuleProps) {
  const { addToast } = useToast()
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'fulfilled'>('all')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const { data: ordersData, refetch: refetchOrders, loading: ordersLoading } = useApi<{ orders: SalesOrder[] }>(
    token ? `/api/studio/sales/orders?status=${filter}` : null,
    token,
  )

  const { data: agingData, refetch: refetchAging } = useApi<{
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

  const handleSendReminder = (item: ReceivableItem) => {
    const text = `Hi ${item.contactName}, this is a gentle reminder regarding invoice ${item.documentNumber} for ${formatCurrency(item.totalCents, 'ZMW')}, which is now ${item.daysOverdue} days pending. Please let us know if you need any assistance!`
    navigator.clipboard.writeText(text)
    addToast({ title: 'Reminder Copied', description: 'WhatsApp payment reminder text copied to clipboard!', variant: 'info' })
  }

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
      {/* Top Accounts Receivable Aging Banner */}
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

        {/* Aging Distribution Bars */}
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

        {/* Overdue Invoices Quick List */}
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

      {/* Sales Orders Section */}
      <div className="space-y-4">
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
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                  filter === f
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
              Sales orders will appear here automatically when customer quotations are accepted or when direct sales orders are created.
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
    </div>
  )
}
