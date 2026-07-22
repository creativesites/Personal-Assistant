'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { FileText, Send, CheckCircle2, Edit3, Loader2, Sparkles, ExternalLink } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useToast } from '@/components/ui'

export interface QuoteSuggestionProps {
  documentId: string
  documentNumber: string
  contactName: string
  documentType: string
  totalFormatted: string
  itemsSummary: string
  token: string | undefined
  onSent?: () => void
}

export function QuoteSuggestionCard({
  documentId,
  documentNumber,
  contactName,
  documentType,
  totalFormatted,
  itemsSummary,
  token,
  onSent,
}: QuoteSuggestionProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const { addToast } = useToast()

  const handleSendWhatsApp = async () => {
    if (!token) return
    setSending(true)
    try {
      await apiClient<{ ok: boolean; shareUrl: string }>(`/api/documents/${documentId}/send-whatsapp`, {
        token,
        method: 'POST',
      })
      setSent(true)
      addToast({
        title: 'Document Dispatched!',
        description: `Sent ${documentType.toUpperCase()} ${documentNumber} to ${contactName} via WhatsApp.`,
        variant: 'success',
      })
      if (onSent) onSent()
    } catch (err: any) {
      addToast({
        title: 'Failed to Send',
        description: err.message || 'Could not send document via WhatsApp.',
        variant: 'error',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="my-3 p-4 rounded-3xl bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-white border border-indigo-100 shadow-sm relative overflow-hidden transition-all hover:shadow-md">
      {/* Background Accent */}
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-indigo-500/5 blur-xl pointer-events-none" />

      {/* Header Badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[11px] font-black shadow-xs">
          <Sparkles className="w-3 h-3" />
          <span>Auto-Quote Ready</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
          {documentNumber}
        </span>
      </div>

      {/* Main Info */}
      <div className="my-2.5">
        <p className="text-xs text-gray-500">Prepared for <span className="font-bold text-gray-900">{contactName}</span></p>
        <p className="text-base font-black text-gray-950 mt-0.5">{totalFormatted}</p>
        {itemsSummary && (
          <p className="text-xs text-gray-600 line-clamp-2 mt-1 bg-white/70 p-2 rounded-xl border border-indigo-50">
            {itemsSummary}
          </p>
        )}
      </div>

      {/* Actions */}
      {sent ? (
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-2xl border border-emerald-100">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Sent to {contactName} on WhatsApp!</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleSendWhatsApp}
            disabled={sending}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-200 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {sending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Sending...</>
            ) : (
              <><Send className="w-3.5 h-3.5" />Approve &amp; Send via WhatsApp</>
            )}
          </button>
          
          <Link
            href={`/documents/new?edit=${documentId}`}
            className="p-2.5 rounded-2xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors"
            title="Edit Draft"
          >
            <Edit3 className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
