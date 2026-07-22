'use client'

import { useState } from 'react'
import { FileText, Loader2, Send } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { DocumentSuggestion } from '../_types/inbox'

// Business Workspace Phase 2 §7 — "customer asks for a quote" -> one-click
// quotation, without leaving the conversation. Driven by the existing
// contact_products 'quoted' signal (see contacts.ts's buildDocumentSuggestion),
// not a new AI detector.
export function DocumentSuggestionCard({
  contactId, suggestion, token,
}: { contactId: string; suggestion: DocumentSuggestion; token: string }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'generated' | 'sent'>('idle')
  const [documentId, setDocumentId] = useState<string | null>(null)

  const generate = async () => {
    setStatus('busy')
    try {
      const created = await apiClient<{ document: { id: string } }>('/api/documents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          contactId,
          documentType: 'quotation',
          items: suggestion.products.map(p => ({
            description: p.name, quantity: p.quantity, unitPriceCents: p.unitPriceCents,
          })),
        }),
      })
      await apiClient(`/api/documents/${created.document.id}/generate`, { method: 'POST', token })
      setDocumentId(created.document.id)
      setStatus('generated')
    } catch {
      setStatus('idle')
    }
  }

  const send = async () => {
    if (!documentId) return
    setStatus('busy')
    try {
      await apiClient(`/api/documents/${documentId}/send-whatsapp`, { method: 'POST', token })
      setStatus('sent')
    } catch {
      setStatus('generated')
    }
  }

  const productLabel = suggestion.products.map(p => `${p.quantity}x ${p.name}`).join(', ')
  const estimate = (suggestion.estimatedTotalCents / 100).toLocaleString(undefined, {
    style: 'currency', currency: suggestion.currency,
  })

  return (
    <div className="rounded-xl p-3.5 border bg-emerald-50 border-emerald-200">
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <FileText size={13} className="text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-tight text-emerald-900">Customer is requesting a quotation</p>
          <p className="text-[11px] mt-0.5 leading-relaxed text-emerald-700">{productLabel} · Est. {estimate}</p>
          <div className="flex gap-2 mt-2.5">
            {status === 'sent' ? (
              <span className="text-[11px] font-bold text-emerald-700">Sent ✓</span>
            ) : status === 'generated' ? (
              <button
                onClick={send}
                className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                <Send size={10} />Send Now
              </button>
            ) : (
              <button
                onClick={generate}
                disabled={status === 'busy'}
                className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {status === 'busy' ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />}
                Generate Quotation
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
