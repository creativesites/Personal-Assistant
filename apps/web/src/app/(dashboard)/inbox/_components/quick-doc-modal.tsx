'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Zap, Send, ExternalLink, Plus, Trash2, Loader2, Sparkles, CheckCircle2
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { apiClient } from '@/lib/api'

interface Props {
  open: boolean
  onClose: () => void
  contact: {
    id: string
    name: string
    phone?: string | null
    email?: string | null
  } | null
  token: string | null
  onDocumentCreatedAndSent?: (docNumber: string, shareUrl: string) => void
}

const DOC_TYPES = [
  { id: 'quotation', label: 'Quotation / Quote', emoji: '💬', color: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
  { id: 'invoice', label: 'Invoice', emoji: '🧾', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  { id: 'receipt', label: 'Payment Receipt', emoji: '💳', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { id: 'nda', label: 'NDA / Confidentiality', emoji: '🔒', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { id: 'delivery_note', label: 'Delivery Note', emoji: '📦', color: 'bg-cyan-50 border-cyan-200 text-cyan-700' },
  { id: 'purchase_order', label: 'Purchase Order', emoji: '🛒', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { id: 'contract', label: 'Contract / Agreement', emoji: '📜', color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { id: 'proposal', label: 'Business Proposal', emoji: '💡', color: 'bg-rose-50 border-rose-200 text-rose-700' },
]

export function QuickDocModal({ open, onClose, contact, token, onDocumentCreatedAndSent }: Props) {
  const router = useRouter()
  const { addToast } = useToast()

  const [documentType, setDocumentType] = useState('quotation')
  const [currency, setCurrency] = useState('ZMW')
  const [items, setItems] = useState([
    { description: '', quantity: 1, unitPriceCents: 0 }
  ])
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open || !contact) return null

  const addItem = () => {
    setItems(prev => [...prev, { description: '', quantity: 1, unitPriceCents: 0 }])
  }

  const removeItem = (idx: number) => {
    if (items.length <= 1) return
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: string, val: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.unitPriceCents), 0) / 100
  }

  const handleCreateDoc = async (andSendWhatsApp: boolean) => {
    if (!token) return

    // Filter valid items
    const validItems = items.filter(i => i.description.trim().length > 0)
    if (validItems.length === 0) {
      addToast({ variant: 'error', title: 'Line item required', description: 'Please enter at least one item description.' })
      return
    }

    setLoading(true)
    try {
      const payload = {
        contactId: contact.id,
        documentType,
        currency,
        items: validItems.map(i => ({
          description: i.description,
          quantity: Number(i.quantity) || 1,
          unitPriceCents: Math.round((Number(i.unitPriceCents) || 0))
        })),
        notes,
      }

      const res = await apiClient<{ document: { id: string; documentNumber: string; shareToken?: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify(payload)
      })

      const doc = res.document

      if (andSendWhatsApp) {
        try {
          await apiClient(`/api/documents/${doc.id}/send`, { method: 'POST', token })
          addToast({ variant: 'success', title: `${doc.documentNumber} Created & Sent via WhatsApp!` })
        } catch {
          addToast({ variant: 'success', title: `${doc.documentNumber} Created!`, description: 'Sending via WhatsApp queued.' })
        }
      } else {
        addToast({ variant: 'success', title: `${doc.documentNumber} Created as Draft` })
      }

      onClose()

      if (onDocumentCreatedAndSent && doc.shareToken) {
        const publicUrl = `${window.location.origin}/shared/${doc.shareToken}`
        onDocumentCreatedAndSent(doc.documentNumber, publicUrl)
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Failed to create document', description: err?.message })
    } finally {
      setLoading(false)
    }
  }

  const openFullEditor = () => {
    onClose()
    router.push(`/documents/new?contactId=${contact.id}&docType=${documentType}`)
  }

  return (
    <Modal open={open} onClose={onClose} title={`⚡ Quick Document for ${contact.name}`} size="lg">
      <div className="space-y-4 p-1">
        {/* Header summary */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
              <Zap size={18} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-300">Fast Document Dispatch</p>
              <p className="text-sm font-extrabold text-white">{contact.name} {contact.phone ? `(${contact.phone})` : ''}</p>
            </div>
          </div>
          <button
            onClick={openFullEditor}
            className="flex items-center gap-1 text-xs font-bold text-indigo-300 hover:text-white bg-white/10 px-3 py-1.5 rounded-xl hover:bg-white/20 transition-all"
          >
            <ExternalLink size={13} /> Full Editor
          </button>
        </div>

        {/* Document Type Selector Grid */}
        <div>
          <label className="text-xs font-extrabold text-gray-700 block mb-1.5">Document Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DOC_TYPES.map(dt => (
              <button
                key={dt.id}
                type="button"
                onClick={() => setDocumentType(dt.id)}
                className={`flex items-center gap-2 p-2.5 rounded-2xl border text-xs font-bold transition-all text-left ${
                  documentType === dt.id
                    ? `${dt.color} ring-2 ring-indigo-500/30 shadow-sm`
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="text-base">{dt.emoji}</span>
                <span className="truncate">{dt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Items Entry Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold text-gray-700">Line Items &amp; Pricing</label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">Currency:</span>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="text-xs font-bold bg-gray-100 border border-gray-200 rounded-lg px-2 py-1 text-gray-800"
              >
                <option value="ZMW">ZMW (K)</option>
                <option value="USD">USD ($)</option>
                <option value="KES">KES (KSh)</option>
                <option value="ZAR">ZAR (R)</option>
                <option value="NGN">NGN (₦)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 p-2 rounded-2xl border border-gray-100 bg-gray-50/50">
                <input
                  type="text"
                  placeholder="Item description (e.g. Website Design, Consultation, Invoice Item)"
                  value={item.description}
                  onChange={e => updateItem(idx, 'description', e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <input
                  type="number"
                  min="1"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}
                  className="w-14 px-2 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-center focus:outline-none"
                />
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1.5 text-xs text-gray-400 font-bold">$</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Unit Price"
                    value={item.unitPriceCents ? item.unitPriceCents / 100 : ''}
                    onChange={e => updateItem(idx, 'unitPriceCents', Math.round((parseFloat(e.target.value) || 0) * 100))}
                    className="w-full pl-6 pr-2 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-bold text-gray-800 focus:outline-none"
                  />
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-xl transition-all"
          >
            <Plus size={13} /> Add Item
          </button>
        </div>

        {/* Notes */}
        <div>
          <input
            type="text"
            placeholder="Optional client notes or payment terms..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Total & Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100">
          <div className="text-left">
            <span className="text-xs text-gray-500 font-semibold block">Estimated Total:</span>
            <span className="text-lg font-black text-gray-900">{currency} {calculateTotal().toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleCreateDoc(false)}
              disabled={loading}
              className="flex-1 sm:flex-none text-xs font-bold py-2.5 rounded-xl border-gray-200 hover:bg-gray-100"
            >
              Save Draft
            </Button>
            <Button
              type="button"
              onClick={() => handleCreateDoc(true)}
              disabled={loading}
              className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              Create &amp; Send WhatsApp
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
