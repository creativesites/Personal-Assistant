'use client'

import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// CV Studio §6 — the rewrite-only AI Assistant toolbar. Every button here
// calls the same operation-parameterized endpoint; nothing here ever
// invents a fact — see CV_STUDIO_NEVER_INVENT_POLICY server-side.

const OPERATIONS: { key: string; label: string }[] = [
  { key: 'improve_wording', label: 'Improve' },
  { key: 'shorten', label: 'Shorten' },
  { key: 'tone_professional', label: 'Professional tone' },
  { key: 'tone_executive', label: 'Executive tone' },
  { key: 'tone_graduate', label: 'Graduate tone' },
  { key: 'ats_optimise', label: 'ATS optimise' },
]

const EMPLOYMENT_OPERATIONS: { key: string; label: string }[] = [
  { key: 'improve_wording', label: 'Improve' },
  { key: 'responsibilities_to_achievements', label: 'Convert to achievements' },
  { key: 'fix_grammar', label: 'Fix grammar' },
]

export function AiRewriteToolbar({
  text, token, onRewritten, variant = 'default',
}: {
  text: string
  token: string
  onRewritten: (rewritten: string) => void
  variant?: 'default' | 'employment'
}) {
  const { addToast } = useToast()
  const [loadingOp, setLoadingOp] = useState<string | null>(null)
  const ops = variant === 'employment' ? EMPLOYMENT_OPERATIONS : OPERATIONS

  const runOperation = async (operation: string) => {
    if (!text.trim()) {
      addToast({ variant: 'error', title: 'Nothing to rewrite yet' })
      return
    }
    setLoadingOp(operation)
    try {
      const result = await apiClient<{ rewritten: string }>('/api/career/cv-assistant/rewrite', {
        method: 'POST', token, body: JSON.stringify({ text, operation }),
      })
      onRewritten(result.rewritten)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not rewrite this text', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setLoadingOp(null)
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {ops.map(op => (
        <button
          key={op.key}
          onClick={() => runOperation(op.key)}
          disabled={loadingOp !== null}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
        >
          {loadingOp === op.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {op.label}
        </button>
      ))}
    </div>
  )
}

export function SuggestMetricButton({ text, token }: { text: string; token: string }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState(false)

  const suggest = async () => {
    if (!text.trim()) return
    setLoading(true)
    try {
      const result = await apiClient<{ question: string }>('/api/career/cv-assistant/suggest-metric', {
        method: 'POST', token, body: JSON.stringify({ text }),
      })
      addToast({ variant: 'info', title: 'Zuri asks', description: result.question })
    } catch {
      addToast({ variant: 'error', title: 'Could not generate a question' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={suggest}
      disabled={loading}
      className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
    >
      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
      Add metrics
    </button>
  )
}
