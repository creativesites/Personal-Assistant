'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileText,
  MapPin,
  Send,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'

export interface AIInsight {
  id?: string
  type: 'observation' | 'opportunity' | 'alert' | 'entity'
  title?: string
  text: string
  confidence?: number // 0.0 to 1.0
  reasons?: string[]
  supportingText?: string | null
  actionLabel?: string
  actionType?: 'save_contact' | 'send_catalogue' | 'draft_apology' | 'custom'
  actionDraftText?: string
}

export function InlineAICard({
  insight,
  onAction,
  onDismiss,
}: {
  insight: AIInsight
  onAction?: (insight: AIInsight) => void
  onDismiss?: (insight: AIInsight) => void
}) {
  const [acted, setActed] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const isAlert = insight.type === 'alert'
  const isOpp = insight.type === 'opportunity'
  const isObs = insight.type === 'observation' || insight.type === 'entity'

  const cfg = isOpp
    ? {
        icon: TrendingUp,
        bg: 'bg-emerald-50/90 border-emerald-200/90',
        badgeBg: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        text: 'text-emerald-900',
        label: insight.title || 'Opportunity Detected',
        btnBg: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm',
        defaultActionLabel: 'Send Catalogue',
        defaultActionIcon: Send,
      }
    : isAlert
    ? {
        icon: AlertTriangle,
        bg: 'bg-amber-50/90 border-amber-200/90',
        badgeBg: 'bg-amber-100 text-amber-900 border-amber-200',
        text: 'text-amber-900',
        label: insight.title || 'Frustration Alert',
        btnBg: 'bg-amber-600 hover:bg-amber-700 text-white shadow-sm',
        defaultActionLabel: 'Draft Apology',
        defaultActionIcon: FileText,
      }
    : {
        icon: isObs && insight.text.toLowerCase().includes('mov') ? MapPin : Sparkles,
        bg: 'bg-indigo-50/90 border-indigo-200/90',
        badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        text: 'text-indigo-900',
        label: insight.title || 'Observation',
        btnBg: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm',
        defaultActionLabel: 'Save to Contact',
        defaultActionIcon: Check,
      }

  const Icon = cfg.icon
  const ActionIcon = cfg.defaultActionIcon

  const confidencePct = insight.confidence ? Math.round(insight.confidence * 100) : null
  const actionText = insight.actionLabel || cfg.defaultActionLabel

  const handleActionClick = () => {
    setActed(true)
    onAction?.(insight)
  }

  const handleDismissClick = () => {
    setDismissed(true)
    onDismiss?.(insight)
  }

  return (
    <div className={`mx-auto w-full max-w-xl rounded-2xl p-3.5 border shadow-sm transition-all ${cfg.bg} flex flex-col gap-2.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-xl bg-white/80 border border-white/90 flex items-center justify-center flex-shrink-0 shadow-2xs`}>
            <Icon size={14} className={cfg.text} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${cfg.badgeBg}`}>
              {cfg.label}
            </span>
            {confidencePct !== null && (
              <span className="text-[10px] font-semibold text-gray-600 bg-white/80 px-2 py-0.5 rounded-full border border-gray-200/80 shadow-2xs">
                {confidencePct}% confidence
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleDismissClick}
          className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors"
          title="Dismiss card"
        >
          <X size={13} />
        </button>
      </div>

      <div className="pl-1">
        <p className="text-xs font-medium text-gray-800 leading-relaxed">{insight.text}</p>

        {/* Reasons list for Alert cards or when supportingText / reasons provided */}
        {insight.reasons && insight.reasons.length > 0 && (
          <div className="mt-2 pt-2 border-t border-black/5 space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Key Drivers / Context:</p>
            <ul className="space-y-1">
              {insight.reasons.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-[11px] text-gray-700">
                  <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-2 pt-1">
        {acted ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white/80 border border-gray-200 text-xs font-semibold text-emerald-700 shadow-2xs">
            <Check size={12} />
            {insight.actionType === 'save_contact' ? 'Saved to Contact' : 'Action Drafted'}
          </span>
        ) : (
          <button
            onClick={handleActionClick}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${cfg.btnBg}`}
          >
            <ActionIcon size={12} />
            {actionText}
          </button>
        )}
      </div>
    </div>
  )
}

