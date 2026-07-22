'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Crown, ShoppingBag, TrendingUp, Wallet, Plus, Search, MessageSquare, ExternalLink, UserPlus
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { formatCurrency } from './shared'

interface Customer {
  id: string
  name: string
  avatarUrl: string | null
  company: string | null
  jobTitle: string | null
  lifetimeValueCents: number
  outstandingCents: number
  purchaseCount: number
  productNames: string[]
  lastPurchase: string | null
  tier: 'gold' | 'silver' | 'bronze'
  atRisk: boolean
  healthScore: number | null
}

const TIER_STYLES: Record<Customer['tier'], string> = {
  gold: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  silver: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  bronze: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
}

export function CustomersModule({ token }: { token: string | undefined }) {
  const router = useRouter()
  const { addToast } = useToast()
  const { data, loading, refetch } = useApi<{ customers: Customer[] }>(
    token ? '/api/studio/customers' : null, token,
  )

  const customers = data?.customers ?? []
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTier, setSelectedTier] = useState<string>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [addForm, setAddForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    jobTitle: '',
  })

  const totalLtvCents = customers.reduce((sum, c) => sum + c.lifetimeValueCents, 0)
  const totalOutstandingCents = customers.reduce((sum, c) => sum + c.outstandingCents, 0)
  const atRiskCount = customers.filter(c => c.atRisk).length

  const filtered = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase()))
    if (!matchesSearch) return false
    if (selectedTier === 'at_risk') return c.atRisk
    if (selectedTier !== 'all') return c.tier === selectedTier
    return true
  })

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addForm.name.trim()) return
    setIsSaving(true)
    try {
      await apiClient('/api/studio/customers', {
        method: 'POST',
        token,
        body: JSON.stringify(addForm),
      })
      addToast({ title: 'Customer Added', description: `${addForm.name} is now in your customer roster.`, variant: 'success' })
      setIsAddOpen(false)
      setAddForm({ name: '', phone: '', email: '', company: '', jobTitle: '' })
      refetch()
    } catch (err: any) {
      addToast({ title: 'Error', description: err.message || 'Failed to add customer', variant: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-gray-900">Customer Relationship Roster</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Commercial pipeline, client lifetime values, and active buyer insights.
          </p>
        </div>
        <Button
          onClick={() => setIsAddOpen(true)}
          className="gap-1.5 text-xs font-semibold shrink-0 min-h-[44px]"
        >
          <UserPlus className="w-4 h-4" />
          Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black tracking-tight text-gray-950">{customers.length}</p>
          <p className="text-xs font-semibold text-gray-500">Active Customers</p>
        </div>
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
            <Wallet className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black tracking-tight text-gray-950">
            {formatCurrency(totalLtvCents / 100)}
          </p>
          <p className="text-xs font-semibold text-gray-500">Total Lifetime Value</p>
        </div>
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-2">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black tracking-tight text-gray-950">{atRiskCount}</p>
          <p className="text-xs font-semibold text-gray-500">At Risk (Declining Activity)</p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers by name or company..."
            className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[40px]"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto min-w-max pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'gold', label: '🥇 Gold' },
            { id: 'silver', label: '🥈 Silver' },
            { id: 'bronze', label: '🥉 Bronze' },
            { id: 'at_risk', label: '⚠️ At Risk' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setSelectedTier(t.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors min-h-[36px] ${
                selectedTier === t.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No customers match criteria"
          description="Try broadening your search or filter options, or add a new customer."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={c.name} src={c.avatarUrl ?? undefined} size="md" />
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{c.name}</p>
                    {(c.jobTitle || c.company) && (
                      <p className="text-xs text-gray-500 truncate">
                        {[c.jobTitle, c.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TIER_STYLES[c.tier]}`}>
                    <Crown className="w-3 h-3" />
                    {c.tier}
                  </span>
                  {c.atRisk && <Badge variant="error">At risk</Badge>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-2xl">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">Lifetime Value</p>
                  <p className="text-sm font-black text-gray-900">{formatCurrency(c.lifetimeValueCents / 100)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">Outstanding Balance</p>
                  <p className={`text-sm font-black ${c.outstandingCents > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {formatCurrency(c.outstandingCents / 100)}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                <span className="inline-flex items-center gap-1 font-medium">
                  <ShoppingBag className="w-3.5 h-3.5 text-indigo-500" />
                  {c.purchaseCount} purchase{c.purchaseCount === 1 ? '' : 's'}
                </span>
                {c.lastPurchase && (
                  <span className="text-[11px]">Last: {new Date(c.lastPurchase).toLocaleDateString()}</span>
                )}
              </div>

              {c.productNames.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {c.productNames.slice(0, 3).map(name => (
                    <Badge key={name} variant="default">{name}</Badge>
                  ))}
                  {c.productNames.length > 3 && (
                    <Badge variant="default">+{c.productNames.length - 3} more</Badge>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/contacts/${c.id}`)}
                  className="flex-1 text-xs font-semibold gap-1 min-h-[38px]"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View CRM Profile
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/inbox?contactId=${c.id}`)}
                  className="px-3 min-h-[38px]"
                  title="Open Chat"
                >
                  <MessageSquare className="w-4 h-4 text-indigo-600" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Customer Modal */}
      <Modal open={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add New Customer">
        <form onSubmit={handleAddCustomer} className="space-y-4 p-1">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name *</label>
            <input
              required
              type="text"
              value={addForm.name}
              onChange={(e) => setAddForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Sarah Jenkins"
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">WhatsApp / Phone</label>
              <input
                type="text"
                value={addForm.phone}
                onChange={(e) => setAddForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="+1 555-0192"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm(f => ({ ...f, email: e.target.value }))}
                placeholder="sarah@acme.com"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Company</label>
              <input
                type="text"
                value={addForm.company}
                onChange={(e) => setAddForm(f => ({ ...f, company: e.target.value }))}
                placeholder="Acme Corp"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Job Title</label>
              <input
                type="text"
                value={addForm.jobTitle}
                onChange={(e) => setAddForm(f => ({ ...f, jobTitle: e.target.value }))}
                placeholder="VP Procurement"
                className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" disabled={isSaving || !addForm.name.trim()}>
              {isSaving ? 'Saving...' : 'Create Customer'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
