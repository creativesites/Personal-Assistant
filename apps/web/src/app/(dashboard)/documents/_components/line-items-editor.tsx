'use client'

import React, { useState } from 'react'
import { Trash2, Plus, Package, Sparkles } from 'lucide-react'
import { CatalogPickerModal, type CatalogProduct, type CatalogPackageTier } from './catalog-picker-modal'

export interface LineItem {
  description: string
  quantity: number
  unitPriceCents: number
  discountPct: number
  taxPct: number
}

export function emptyLineItem(): LineItem {
  return { description: '', quantity: 1, unitPriceCents: 0, discountPct: 0, taxPct: 0 }
}

export function computeLineItemTotals(items: LineItem[]) {
  let subtotal = 0, discount = 0, tax = 0
  for (const item of items) {
    const lineSubtotal = Math.round((item.quantity || 0) * (item.unitPriceCents || 0))
    const lineDiscount = Math.round(lineSubtotal * ((item.discountPct || 0) / 100))
    const afterDiscount = lineSubtotal - lineDiscount
    const lineTax = Math.round(afterDiscount * ((item.taxPct || 0) / 100))
    subtotal += lineSubtotal
    discount += lineDiscount
    tax += lineTax
  }
  return { subtotal, discount, tax, total: subtotal - discount + tax }
}

function formatMoney(cents: number, currency: string) {
  return `${currency} ${(cents / 100).toFixed(2)}`
}

interface LineItemsEditorProps {
  items: LineItem[]
  onChange: (items: LineItem[]) => void
  currency: string
  token?: string
  onSelectServiceDetails?: (serviceDetails: any) => void
}

export function LineItemsEditor({
  items,
  onChange,
  currency,
  token,
  onSelectServiceDetails,
}: LineItemsEditorProps) {
  const [catalogModalOpen, setCatalogModalOpen] = useState(false)

  function updateItem(i: number, patch: Partial<LineItem>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }

  const totals = computeLineItemTotals(items)

  const handleCatalogSelect = (product: CatalogProduct, selectedPackage?: CatalogPackageTier) => {
    const rawPrice = selectedPackage?.price !== undefined && selectedPackage?.price !== null
      ? selectedPackage.price
      : product.sellingPrice ?? product.price ?? 0

    const unitPriceCents = Math.round(Number(rawPrice) * 100)

    let desc = product.name
    if (selectedPackage) {
      desc += ` — ${selectedPackage.name}`
      if (selectedPackage.features && selectedPackage.features.length > 0) {
        desc += ` (${selectedPackage.features.join(', ')})`
      }
    } else if (product.description) {
      desc += ` — ${product.description}`
    }

    const newItem: LineItem = {
      description: desc,
      quantity: 1,
      unitPriceCents,
      discountPct: 0,
      taxPct: 0,
    }

    // Filter out trailing empty item if any exists
    const cleanedItems = items.filter(it => it.description.trim() !== '' || it.unitPriceCents > 0)
    onChange([...cleanedItems, newItem])

    // If service details exist, notify parent form
    if (onSelectServiceDetails && (product.itemType === 'service' || selectedPackage)) {
      onSelectServiceDetails({
        duration: selectedPackage?.duration || product.serviceDetails?.duration || undefined,
        sla: product.serviceDetails?.sla || undefined,
        deliverables: selectedPackage?.features || product.serviceDetails?.deliverables || undefined,
        prerequisites: product.serviceDetails?.prerequisites || undefined,
      })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
          Line Items &amp; Pricing
        </label>
        {token && (
          <button
            type="button"
            onClick={() => setCatalogModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-bold transition-all shadow-2xs"
          >
            <Package className="w-3.5 h-3.5 text-indigo-600" />
            <span>Select from Catalog / Services</span>
          </button>
        )}
      </div>

      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_60px_90px_60px_60px_28px] gap-1.5 items-center bg-gray-50/60 p-2 sm:p-0 rounded-xl sm:bg-transparent border border-gray-100 sm:border-0">
            <input
              placeholder="Description (e.g. Website Development, Consulting Services)"
              value={item.description}
              onChange={e => updateItem(i, { description: e.target.value })}
              className="col-span-2 sm:col-span-1 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <input
              type="number" min={0} placeholder="Qty"
              value={item.quantity}
              onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <input
              type="number" min={0} step="0.01" placeholder="Unit price"
              value={item.unitPriceCents ? (item.unitPriceCents / 100).toFixed(2) : ''}
              onChange={e => updateItem(i, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <input
              type="number" min={0} max={100} placeholder="Disc %"
              value={item.discountPct || ''}
              onChange={e => updateItem(i, { discountPct: parseFloat(e.target.value) || 0 })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <input
              type="number" min={0} max={100} placeholder="Tax %"
              value={item.taxPct || ''}
              onChange={e => updateItem(i, { taxPct: parseFloat(e.target.value) || 0 })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              disabled={items.length === 1}
              className="min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-red-500 disabled:opacity-30"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          type="button"
          onClick={() => onChange([...items, emptyLineItem()])}
          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 min-h-9"
        >
          <Plus className="w-3.5 h-3.5" /> Add Line Item
        </button>

        {token && (
          <button
            type="button"
            onClick={() => setCatalogModalOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-700 min-h-9 ml-auto"
          >
            <Sparkles className="w-3.5 h-3.5" /> Browse Products &amp; Service Packages
          </button>
        )}
      </div>

      {/* Totals Summary Card */}
      <div className="bg-gray-50 rounded-2xl p-3.5 text-sm space-y-1.5 mt-3 border border-gray-100">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span className="text-red-600">-{formatMoney(totals.discount, currency)}</span></div>}
        {totals.tax > 0 && <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatMoney(totals.tax, currency)}</span></div>}
        <div className="flex justify-between font-black text-gray-950 pt-2 border-t border-gray-200 text-base"><span>Total</span><span className="text-indigo-600">{formatMoney(totals.total, currency)}</span></div>
      </div>

      {/* Catalog Picker Modal */}
      {token && (
        <CatalogPickerModal
          open={catalogModalOpen}
          token={token}
          onClose={() => setCatalogModalOpen(false)}
          onSelect={handleCatalogSelect}
        />
      )}
    </div>
  )
}
