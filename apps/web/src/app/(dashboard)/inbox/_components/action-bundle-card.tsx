'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Check, X, Loader2, ChevronRight } from 'lucide-react'
import { apiClient } from '@/lib/api'

// Business OS Phase E — the conversation-to-automation loop (see
// docs/BUSINESS_OS_PLAN.md §15/§16). A passive detector proposes a bundle
// of related actions from an ordinary WhatsApp message (e.g. "I'd like 10
// uniforms" -> create a deal, reserve stock, draft a quotation, schedule a
// follow-up) instead of the single-action [ACTION: ...] chat tags, which
// only fire inside an active AI chat. Execution stays client-side, reusing
// the same {type, params} shape and per-type API calls the chat-tag system
// already established — this card is a second *renderer* for that shape,
// not a second execution mechanism.

interface BundleAction {
  type: 'create_deal' | 'reserve_stock' | 'generate_document' | 'reminder'
  params: string[]
}

export interface ActionBundle {
  id: string
  contactId: string | null
  contactName: string | null
  conversationId: string | null
  summary: string
  actions: BundleAction[]
  status: 'pending' | 'approved' | 'partially_approved' | 'dismissed' | 'expired'
  detectedAt: string
  resolvedAt: string | null
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quotation: 'Quotation', invoice: 'Invoice', proposal: 'Proposal', contract: 'Contract',
}

function actionLabel(action: BundleAction): string {
  switch (action.type) {
    case 'create_deal': {
      const [, , productName, quantity] = action.params
      return `Create deal — ${quantity}× ${productName}`
    }
    case 'reserve_stock': {
      const [, productName, quantity] = action.params
      return `Reserve ${quantity}× ${productName} in stock`
    }
    case 'generate_document': {
      const [documentType] = action.params
      return `Draft a ${DOCUMENT_TYPE_LABELS[documentType] ?? documentType}`
    }
    case 'reminder': {
      const [title, date] = action.params
      const formatted = (() => {
        try { return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
        catch { return date }
      })()
      return `Schedule reminder: ${title} (${formatted})`
    }
    default:
      return 'Unknown action'
  }
}

async function executeAction(action: BundleAction, token: string): Promise<void> {
  switch (action.type) {
    case 'create_deal': {
      const [contactId, productId, productName, quantity] = action.params
      await apiClient('/api/deals', {
        method: 'POST', token,
        body: JSON.stringify({
          contactId,
          title: `Order: ${quantity}× ${productName}`,
          stage: 'proposal',
          productIds: [productId],
        }),
      })
      return
    }
    case 'reserve_stock': {
      const [productId, , quantity] = action.params
      await apiClient(`/api/products/${productId}/reserve`, {
        method: 'POST', token,
        body: JSON.stringify({ quantity: parseInt(quantity, 10), reason: 'Reserved for detected order' }),
      })
      return
    }
    case 'generate_document': {
      const [documentType, contactId, brief] = action.params
      const created = await apiClient<{ document: { id: string } }>('/api/documents/ai-generate', {
        method: 'POST', token,
        body: JSON.stringify({ contactId, documentType, instruction: brief }),
      })
      await apiClient(`/api/documents/${created.document.id}/generate`, { method: 'POST', token })
      return
    }
    case 'reminder': {
      const [title, date] = action.params
      await apiClient('/api/calendar/events', {
        method: 'POST', token,
        body: JSON.stringify({ title, eventDate: date, eventType: 'reminder' }),
      })
      return
    }
  }
}

export function ActionBundleCard({
  bundle, token, onResolved,
}: { bundle: ActionBundle; token: string; onResolved: () => void }) {
  const [checked, setChecked] = useState<boolean[]>(bundle.actions.map(() => true))
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<('idle' | 'done' | 'failed')[]>(bundle.actions.map(() => 'idle'))
  const [expanded, setExpanded] = useState(true)

  async function approve() {
    setBusy(true)
    const nextResults = [...results]
    let anyChecked = false
    let anyFailed = false
    for (let i = 0; i < bundle.actions.length; i++) {
      if (!checked[i]) continue
      anyChecked = true
      try {
        await executeAction(bundle.actions[i], token)
        nextResults[i] = 'done'
      } catch {
        nextResults[i] = 'failed'
        anyFailed = true
      }
    }
    setResults(nextResults)

    const allCheckedAndDone = bundle.actions.every((_, i) => checked[i] && nextResults[i] === 'done')
    try {
      await apiClient(`/api/action-bundles/${bundle.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ status: anyChecked && allCheckedAndDone && !anyFailed ? 'approved' : 'partially_approved' }),
      })
    } catch {}
    setBusy(false)
    onResolved()
  }

  async function dismiss() {
    setBusy(true)
    try {
      await apiClient(`/api/action-bundles/${bundle.id}`, {
        method: 'PATCH', token, body: JSON.stringify({ status: 'dismissed' }),
      })
    } catch {}
    setBusy(false)
    onResolved()
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-2.5 p-3.5 text-left"
      >
        <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Zap size={13} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-indigo-900">Detected order</p>
          <p className="text-[11px] text-indigo-700 leading-relaxed mt-0.5">{bundle.summary}</p>
        </div>
        <ChevronRight size={14} className={`text-indigo-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-2">
          {bundle.actions.map((action, i) => (
            <label key={i} className="flex items-center gap-2 text-[11px] text-indigo-900">
              <input
                type="checkbox"
                checked={checked[i]}
                disabled={busy || results[i] !== 'idle'}
                onChange={e => setChecked(c => c.map((v, j) => j === i ? e.target.checked : v))}
                className="rounded border-indigo-300"
              />
              <span className="flex-1">{actionLabel(action)}</span>
              {results[i] === 'done' && <Check size={12} className="text-emerald-600" />}
              {results[i] === 'failed' && <X size={12} className="text-red-500" />}
            </label>
          ))}

          <div className="flex gap-2 pt-1.5">
            <button
              onClick={approve}
              disabled={busy || checked.every(c => !c)}
              className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
              Approve Selected
            </button>
            <button
              onClick={dismiss}
              disabled={busy}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 bg-white text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ActionBundlesSection({
  contactId, token, refreshKey,
}: { contactId: string; token: string; refreshKey: number }) {
  const [bundles, setBundles] = useState<ActionBundle[]>([])

  const load = useCallback(() => {
    apiClient<{ bundles: ActionBundle[] }>(`/api/action-bundles?status=pending&contactId=${contactId}`, { token })
      .then(d => setBundles(d.bundles))
      .catch(() => {})
  }, [contactId, token])

  useEffect(() => { load() }, [load, refreshKey])

  if (bundles.length === 0) return null

  return (
    <div className="p-4 space-y-2">
      {bundles.map(b => (
        <ActionBundleCard key={b.id} bundle={b} token={token} onResolved={load} />
      ))}
    </div>
  )
}
