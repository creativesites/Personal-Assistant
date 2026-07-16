'use client'

import { AlertTriangle, Crown, ShoppingBag, TrendingUp, Wallet } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SkeletonCard } from '@/components/ui/skeleton'
import { useApi } from '@/hooks/use-api'
import { formatCurrency } from './shared'

// ─── Customers Module ─────────────────────────────────────────────────────
// Customer Management is deliberately NOT a new entity — `customer_status`
// already exists on `contacts` (migration 0021). This tab is a Studio-side
// commercial lens (LTV, outstanding balance, purchase history, tier,
// at-risk) over the same contacts/relationships/documents data, reusing
// GET /api/studio/customers. See CLAUDE.md "Business Events" /
// docs/BUSINESS_EVENTS_PLAN.md §6.

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
  const { data, loading } = useApi<{ customers: Customer[] }>(
    token ? '/api/studio/customers' : null, token,
  )

  const customers = data?.customers ?? []
  const totalLtvCents = customers.reduce((sum, c) => sum + c.lifetimeValueCents, 0)
  const totalOutstandingCents = customers.reduce((sum, c) => sum + c.outstandingCents, 0)
  const atRiskCount = customers.filter(c => c.atRisk).length

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Customers</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Contacts marked as customers, ranked by lifetime value.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black tracking-tight text-gray-950">{customers.length}</p>
          <p className="text-xs font-semibold text-gray-500">Total customers</p>
        </div>
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
            <Wallet className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black tracking-tight text-gray-950">
            {formatCurrency(totalLtvCents / 100)}
          </p>
          <p className="text-xs font-semibold text-gray-500">Total lifetime value</p>
        </div>
        <div className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100">
          <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mb-2">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-2xl font-black tracking-tight text-gray-950">{atRiskCount}</p>
          <p className="text-xs font-semibold text-gray-500">At risk</p>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers yet"
          description="Mark a contact's status as 'customer' from their profile to see them here."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {customers.map(c => (
            <div key={c.id} className="bg-white rounded-[1.75rem] border border-gray-100 shadow-sm shadow-gray-200/70 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={c.name} src={c.avatarUrl ?? undefined} size="md" />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{c.name}</p>
                    {(c.jobTitle || c.company) && (
                      <p className="text-xs text-gray-500 truncate">
                        {[c.jobTitle, c.company].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIER_STYLES[c.tier]}`}>
                    <Crown className="w-3 h-3" />
                    {c.tier}
                  </span>
                  {c.atRisk && <Badge variant="error">At risk</Badge>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">Lifetime value</p>
                  <p className="text-sm font-bold text-gray-900">{formatCurrency(c.lifetimeValueCents / 100)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">Outstanding</p>
                  <p className={`text-sm font-bold ${c.outstandingCents > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                    {formatCurrency(c.outstandingCents / 100)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 mt-3 flex-wrap text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  {c.purchaseCount} purchase{c.purchaseCount === 1 ? '' : 's'}
                </span>
                {c.lastPurchase && (
                  <span>Last: {new Date(c.lastPurchase).toLocaleDateString()}</span>
                )}
              </div>

              {c.productNames.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-3">
                  {c.productNames.slice(0, 4).map(name => (
                    <Badge key={name} variant="default">{name}</Badge>
                  ))}
                  {c.productNames.length > 4 && (
                    <Badge variant="default">+{c.productNames.length - 4} more</Badge>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
