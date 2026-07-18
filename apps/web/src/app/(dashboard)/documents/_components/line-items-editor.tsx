'use client'

import { Trash2 } from 'lucide-react'

// Lifted out of business/page.tsx's NewDocumentModal — the fuller of the
// two line-item editors that existed (its shape already matches the
// backend's lineItemSchema directly: unitPriceCents, not a display-dollar
// string), so create and edit both build on this instead of new/page.tsx's
// narrower version.

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
    const lineSubtotal = Math.round(item.quantity * item.unitPriceCents)
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

export function LineItemsEditor({
  items, onChange, currency,
}: { items: LineItem[]; onChange: (items: LineItem[]) => void; currency: string }) {
  function updateItem(i: number, patch: Partial<LineItem>) {
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  const totals = computeLineItemTotals(items)

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-2">Line items</label>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_60px_90px_60px_60px_28px] gap-1.5 items-center">
            <input
              placeholder="Description"
              value={item.description}
              onChange={e => updateItem(i, { description: e.target.value })}
              className="col-span-2 sm:col-span-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number" min={0} placeholder="Qty"
              value={item.quantity}
              onChange={e => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number" min={0} placeholder="Unit price"
              value={item.unitPriceCents / 100}
              onChange={e => updateItem(i, { unitPriceCents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number" min={0} max={100} placeholder="Disc %"
              value={item.discountPct}
              onChange={e => updateItem(i, { discountPct: parseFloat(e.target.value) || 0 })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="number" min={0} max={100} placeholder="Tax %"
              value={item.taxPct}
              onChange={e => updateItem(i, { taxPct: parseFloat(e.target.value) || 0 })}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              disabled={items.length === 1}
              className="min-w-11 min-h-11 flex items-center justify-center"
            >
              <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500 disabled:opacity-30" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onChange([...items, emptyLineItem()])}
        className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 min-h-11"
      >
        + Add line item
      </button>

      <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1 mt-3">
        <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatMoney(totals.subtotal, currency)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between text-gray-600"><span>Discount</span><span>-{formatMoney(totals.discount, currency)}</span></div>}
        {totals.tax > 0 && <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatMoney(totals.tax, currency)}</span></div>}
        <div className="flex justify-between font-semibold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{formatMoney(totals.total, currency)}</span></div>
      </div>
    </div>
  )
}
