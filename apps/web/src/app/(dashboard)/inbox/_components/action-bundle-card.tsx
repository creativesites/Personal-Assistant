'use client'

import { useState, useEffect, useCallback } from 'react'
import { Zap, Check, X, Minus, Loader2, ChevronRight, CornerDownRight } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { actionLabel, executeAction, type BundleAction } from '@/lib/action-executor'

// Business OS Phase E — the conversation-to-automation loop (see
// docs/BUSINESS_OS_PLAN.md §15/§16). A passive detector proposes a bundle
// of related actions from an ordinary WhatsApp message (e.g. "I'd like 10
// uniforms" -> create a deal, reserve stock, draft a quotation, schedule a
// follow-up) instead of the single-action [ACTION: ...] chat tags, which
// only fire inside an active AI chat. Execution stays client-side, reusing
// the same {type, params} shape and per-type API calls the chat-tag system
// already established — this card is a second *renderer* for that shape,
// not a second execution mechanism. actionLabel/executeAction now live in
// ../../../../lib/action-executor so a future Automation Engine consumer
// (Neural Layer Phase 6, docs/NEURAL_LAYER_PLAN.md §4.9) can share them.

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
  // Business Events Plan §5 — a bundle can now explain itself instead of
  // just showing a free-text summary.
  confidence: number | null
  evidence: string[]
}

type ActionResult = 'idle' | 'done' | 'failed' | 'skipped'

function bundleTitle(actions: BundleAction[]): string {
  const types = new Set(actions.map(a => a.type))
  if (types.has('create_deal')) return 'Detected order'
  if (types.has('create_product') && types.has('create_supplier')) return 'New product & supplier detected'
  if (types.has('create_product')) return 'New product detected'
  if (types.has('create_supplier')) return 'New supplier detected'
  if (types.has('create_career_opportunity')) return 'Career opportunity detected'
  return 'Business update detected'
}

export function ActionBundleCard({
  bundle, token, onResolved,
}: { bundle: ActionBundle; token: string; onResolved: () => void }) {
  const [checked, setChecked] = useState<boolean[]>(bundle.actions.map(() => true))
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<ActionResult[]>(bundle.actions.map(() => 'idle'))
  const [expanded, setExpanded] = useState(true)

  // Neural Layer Phase 6 (docs/NEURAL_LAYER_PLAN.md §4.9) — sequence
  // gating: unchecking an action cascades to anything downstream that
  // depends on it, so the user can't leave the card in a state where a
  // dependent action is checked but its prerequisite isn't.
  function toggle(i: number, value: boolean) {
    setChecked(prev => {
      const next = [...prev]
      next[i] = value
      if (!value) {
        const stack = [i]
        while (stack.length) {
          const idx = stack.pop()!
          bundle.actions.forEach((a, j) => {
            if ((a.dependsOn ?? []).includes(idx) && next[j]) {
              next[j] = false
              stack.push(j)
            }
          })
        }
      }
      return next
    })
  }

  const depsSatisfied = (i: number) => (bundle.actions[i].dependsOn ?? []).every(d => checked[d])

  async function approve() {
    setBusy(true)
    const nextResults: ActionResult[] = bundle.actions.map(() => 'idle')
    let anyChecked = false
    let anyIncomplete = false

    for (let i = 0; i < bundle.actions.length; i++) {
      if (!checked[i]) { nextResults[i] = 'skipped'; continue }
      anyChecked = true
      const deps = bundle.actions[i].dependsOn ?? []
      const depsOk = deps.every(d => nextResults[d] === 'done')
      if (!depsOk) {
        nextResults[i] = 'skipped'
        anyIncomplete = true
        continue
      }
      try {
        await executeAction(bundle.actions[i], token)
        nextResults[i] = 'done'
      } catch {
        nextResults[i] = 'failed'
        anyIncomplete = true
      }
      setResults([...nextResults])
    }

    const allCheckedAndDone = bundle.actions.every((_, i) => !checked[i] || nextResults[i] === 'done')
    try {
      await apiClient(`/api/action-bundles/${bundle.id}`, {
        method: 'PATCH', token,
        body: JSON.stringify({ status: anyChecked && allCheckedAndDone && !anyIncomplete ? 'approved' : 'partially_approved' }),
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
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold text-indigo-900">{bundleTitle(bundle.actions)}</p>
            {bundle.confidence != null && (
              <span className="text-[10px] font-semibold text-indigo-500">{Math.round(bundle.confidence * 100)}% confident</span>
            )}
          </div>
          <p className="text-[11px] text-indigo-700 leading-relaxed mt-0.5">{bundle.summary}</p>
        </div>
        <ChevronRight size={14} className={`text-indigo-400 flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-1.5">
          {bundle.evidence.length > 0 && (
            <ul className="text-[10px] text-indigo-500 space-y-0.5 pb-1">
              {bundle.evidence.map((e, i) => <li key={i}>— {e}</li>)}
            </ul>
          )}
          {bundle.actions.map((action, i) => {
            const isSequenced = (action.dependsOn ?? []).length > 0
            const blocked = isSequenced && !depsSatisfied(i)
            return (
              <label
                key={i}
                className={`flex items-center gap-2 text-[11px] text-indigo-900 ${isSequenced ? 'ml-3.5' : ''}`}
              >
                {isSequenced && <CornerDownRight size={11} className="text-indigo-300 flex-shrink-0" />}
                <input
                  type="checkbox"
                  checked={checked[i]}
                  disabled={busy || results[i] !== 'idle' || blocked}
                  onChange={e => toggle(i, e.target.checked)}
                  className="rounded border-indigo-300"
                />
                <span className={`flex-1 ${blocked ? 'text-indigo-400' : ''}`}>{actionLabel(action)}</span>
                {results[i] === 'done' && <Check size={12} className="text-emerald-600" />}
                {results[i] === 'failed' && <X size={12} className="text-red-500" />}
                {results[i] === 'skipped' && <Minus size={12} className="text-indigo-300" />}
              </label>
            )
          })}

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
