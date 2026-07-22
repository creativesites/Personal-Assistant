'use client'

import React, { useState, useEffect } from 'react'
import { Search, X, Package, Check, Plus, Loader2, Tag } from 'lucide-react'
import { apiClient } from '@/lib/api'

export interface CatalogProduct {
  id: string
  name: string
  description?: string | null
  price?: number | null
  sellingPrice?: number | null
  currency?: string
  category?: string | null
  itemType?: string
  stock?: number
}

interface CatalogPickerModalProps {
  open: boolean
  token: string | undefined
  onClose: () => void
  onSelect: (product: CatalogProduct) => void
}

export function CatalogPickerModal({ open, token, onClose, onSelect }: CatalogPickerModalProps) {
  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !token) return
    setLoading(true)
    setError(null)

    apiClient<{ products: CatalogProduct[] }>('/api/products', { token })
      .then(res => {
        setProducts(res.products || [])
      })
      .catch(err => {
        setError('Failed to load products from catalog')
      })
      .finally(() => setLoading(false))
  }, [open, token])

  if (!open) return null

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.category && p.category.toLowerCase().includes(query.toLowerCase())) ||
    (p.description && p.description.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl border border-gray-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/50 to-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-200">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-950">Select from Product Catalog</h3>
              <p className="text-[11px] text-gray-500">Pick items to auto-fill line details and pricing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3 border-b border-gray-100 bg-gray-50/50">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search products or services by name, category..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-400"
            />
          </div>
        </div>

        {/* Products List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
              <p className="text-xs font-medium">Loading catalog products...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 px-4 text-xs text-red-500">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 px-4 space-y-2">
              <Package className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-xs font-semibold text-gray-700">
                {query ? 'No matching items found' : 'Your product catalog is empty'}
              </p>
              <p className="text-[11px] text-gray-400">
                {query ? 'Try a different search term' : 'Add products in Document Studio -> Catalog first.'}
              </p>
            </div>
          ) : (
            filtered.map(p => {
              const displayPrice = p.sellingPrice ?? p.price ?? 0
              return (
                <div
                  key={p.id}
                  onClick={() => { onSelect(p); onClose(); }}
                  className="group flex items-center justify-between p-3 rounded-2xl border border-gray-100 hover:border-indigo-300 hover:bg-indigo-50/40 cursor-pointer transition-all"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                        {p.name}
                      </p>
                      {p.itemType && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-gray-100 text-gray-600 uppercase tracking-wider">
                          {p.itemType}
                        </span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{p.description}</p>
                    )}
                    {p.category && (
                      <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                        <Tag className="w-3 h-3" />
                        <span>{p.category}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 flex items-center gap-3">
                    <div>
                      <p className="text-sm font-black text-indigo-600">
                        {p.currency || 'USD'} {Number(displayPrice).toFixed(2)}
                      </p>
                      {p.stock !== undefined && p.stock !== null && (
                        <p className="text-[10px] text-gray-400">Stock: {p.stock}</p>
                      )}
                    </div>
                    <div className="w-7 h-7 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-all">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center text-xs text-gray-500">
          <span>{filtered.length} items available</span>
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
