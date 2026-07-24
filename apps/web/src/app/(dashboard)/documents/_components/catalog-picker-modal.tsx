'use client'

import React, { useState, useEffect } from 'react'
import { Search, X, Package, Check, Plus, Loader2, Tag, Wrench, Layers, ChevronRight, Sparkles } from 'lucide-react'
import { apiClient } from '@/lib/api'

export interface CatalogPackageTier {
  id: string
  kind?: 'package' | 'milestone'
  name: string
  price?: number | null
  currency?: string
  duration?: string | null
  features?: string[]
  extras?: string[]
}

export interface CatalogProduct {
  id: string
  name: string
  description?: string | null
  price?: number | null
  sellingPrice?: number | null
  currency?: string
  category?: string | null
  itemType?: 'product' | 'service' | 'bundle' | 'package' | 'subscription' | 'digital_product' | string
  stock?: number
  serviceDetails?: {
    duration?: string
    sla?: string
    deliverables?: string[]
    prerequisites?: string
    packages?: CatalogPackageTier[]
    [key: string]: any
  } | null
  discountRules?: any[]
}

interface CatalogPickerModalProps {
  open: boolean
  token: string | undefined
  onClose: () => void
  onSelect: (product: CatalogProduct, selectedPackage?: CatalogPackageTier) => void
}

type TabType = 'all' | 'product' | 'service' | 'package'

export function CatalogPickerModal({ open, token, onClose, onSelect }: CatalogPickerModalProps) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<TabType>('all')
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Expandable packages state for service items
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingTiersId, setLoadingTiersId] = useState<string | null>(null)
  const [productTiers, setProductTiers] = useState<Record<string, CatalogPackageTier[]>>({})

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    setError(null)

    apiClient<{ products: CatalogProduct[] }>('/api/products', { token })
      .then(res => {
        setProducts(res.products || [])
      })
      .catch(err => {
        setError('Failed to load products and services from catalog')
      })
      .finally(() => setLoading(false))
  }, [open, token])

  const toggleExpandService = async (p: CatalogProduct, e: React.MouseEvent) => {
    e.stopPropagation()
    if (expandedId === p.id) {
      setExpandedId(null)
      return
    }

    setExpandedId(p.id)
    if (!productTiers[p.id] && token) {
      setLoadingTiersId(p.id)
      try {
        const res = await apiClient<{ tiers: CatalogPackageTier[] }>(`/api/products/${p.id}/pricing-tiers`, { token })
        setProductTiers(prev => ({ ...prev, [p.id]: res.tiers || [] }))
      } catch (err) {
        // Fallback to serviceDetails.packages if API call fails
        const fallback = p.serviceDetails?.packages || []
        setProductTiers(prev => ({ ...prev, [p.id]: fallback }))
      } finally {
        setLoadingTiersId(null)
      }
    }
  }

  if (!open) return null

  const filtered = products.filter(p => {
    const matchesQuery = p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.category && p.category.toLowerCase().includes(query.toLowerCase())) ||
      (p.description && p.description.toLowerCase().includes(query.toLowerCase()))

    if (!matchesQuery) return false

    const itemType = p.itemType || 'product'
    if (tab === 'product') return itemType === 'product' || itemType === 'digital_product'
    if (tab === 'service') return itemType === 'service' || itemType === 'subscription'
    if (tab === 'package') return itemType === 'bundle' || itemType === 'package'

    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-gray-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/30">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-200">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-950">Select Products, Services &amp; Packages</h3>
              <p className="text-[11px] text-gray-500">Auto-fill pricing, deliverables, and package options into document line items</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Tabs */}
        <div className="p-3 border-b border-gray-100 bg-gray-50/50 space-y-2.5">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search products, services, or packages..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1 bg-gray-200/60 p-1 rounded-xl">
            {[
              { id: 'all', label: 'All Catalog', icon: Package },
              { id: 'product', label: 'Products', icon: Tag },
              { id: 'service', label: 'Services', icon: Wrench },
              { id: 'package', label: 'Packages & Bundles', icon: Layers },
            ].map(t => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id as TabType)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                    active ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Catalog Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs font-medium">Loading catalog items...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 px-4 text-xs text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-2">
              <Package className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-xs font-semibold text-gray-700">
                {query ? 'No matching items found' : 'Your catalog is empty'}
              </p>
              <p className="text-[11px] text-gray-400">
                {query ? 'Try adjusting your search query or tab filter' : 'Add products or services in Brand Studio -> Catalog first.'}
              </p>
            </div>
          ) : (
            filtered.map(p => {
              const displayPrice = p.sellingPrice ?? p.price ?? 0
              const isService = p.itemType === 'service' || p.itemType === 'subscription'
              const isPackage = p.itemType === 'package' || p.itemType === 'bundle'
              const tiers = productTiers[p.id] || p.serviceDetails?.packages || []
              const isExpanded = expandedId === p.id

              return (
                <div
                  key={p.id}
                  className="rounded-2xl border border-gray-100 hover:border-indigo-200 bg-white transition-all overflow-hidden"
                >
                  <div
                    onClick={() => { onSelect(p); onClose(); }}
                    className="group flex items-center justify-between p-3 cursor-pointer hover:bg-indigo-50/30 transition-colors"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                          {p.name}
                        </p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          isService
                            ? 'bg-purple-100 text-purple-700'
                            : isPackage
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {p.itemType || 'product'}
                        </span>
                      </div>
                      {p.description && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-[10px] text-gray-400 mt-1">
                        {p.category && (
                          <div className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            <span>{p.category}</span>
                          </div>
                        )}
                        {p.serviceDetails?.duration && (
                          <span className="text-purple-600 font-semibold">Duration: {p.serviceDetails.duration}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 flex items-center gap-2">
                      <div>
                        <p className="text-sm font-black text-indigo-600">
                          {p.currency || 'USD'} {Number(displayPrice).toFixed(2)}
                        </p>
                        {p.stock !== undefined && p.stock !== null && !isService && (
                          <p className="text-[10px] text-gray-400">Stock: {p.stock}</p>
                        )}
                      </div>

                      {/* Expand service packages button if service */}
                      {isService && (
                        <button
                          type="button"
                          onClick={(e) => toggleExpandService(p, e)}
                          className="px-2 py-1.5 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 text-[11px] font-bold flex items-center gap-1 transition-all"
                          title="View Service Packages & Tiers"
                        >
                          <Layers className="w-3 h-3" />
                          <span>Packages</span>
                          <ChevronRight className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>
                      )}

                      <div className="w-7 h-7 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-all">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </div>

                  {/* Expanded Service Packages / Tiers */}
                  {isExpanded && (
                    <div className="p-3 bg-purple-50/40 border-t border-purple-100 space-y-2 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs text-purple-900 font-bold px-1">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                          Available Service Packages &amp; Tiers
                        </span>
                        <span className="text-[10px] text-purple-600 font-medium">Click a package to add to doc</span>
                      </div>

                      {loadingTiersId === p.id ? (
                        <div className="flex items-center justify-center py-4 text-xs text-purple-600 gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                          <span>Loading packages...</span>
                        </div>
                      ) : tiers.length === 0 ? (
                        <div className="p-3 rounded-xl bg-white/80 border border-purple-100 text-center text-xs text-gray-500">
                          No distinct pricing packages set. Click main service item above to insert base pricing.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-1.5">
                          {tiers.map((tier, idx) => {
                            const tierPrice = tier.price !== undefined && tier.price !== null ? tier.price : displayPrice
                            return (
                              <div
                                key={tier.id || idx}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onSelect(p, tier)
                                  onClose()
                                }}
                                className="group/tier flex items-center justify-between p-2.5 rounded-xl bg-white border border-purple-100 hover:border-purple-300 hover:bg-purple-100/50 cursor-pointer transition-all shadow-2xs"
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="flex items-center gap-2">
                                    <p className="text-xs font-bold text-gray-900 group-hover/tier:text-purple-700 transition-colors">
                                      {tier.name}
                                    </p>
                                    {tier.duration && (
                                      <span className="text-[10px] text-purple-600 font-semibold bg-purple-100 px-1.5 py-0.5 rounded">
                                        {tier.duration}
                                      </span>
                                    )}
                                  </div>
                                  {tier.features && tier.features.length > 0 && (
                                    <p className="text-[11px] text-gray-500 truncate mt-0.5">
                                      • {tier.features.join(' • ')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <span className="text-xs font-black text-purple-700">
                                    {tier.currency || p.currency || 'USD'} {Number(tierPrice).toFixed(2)}
                                  </span>
                                  <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 group-hover/tier:bg-purple-600 group-hover/tier:text-white flex items-center justify-center transition-all">
                                    <Plus className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center text-xs text-gray-500">
          <span>{filtered.length} items found</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-100 text-gray-700 font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
