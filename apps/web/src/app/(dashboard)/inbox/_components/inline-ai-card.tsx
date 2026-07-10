'use client'

import { AlertTriangle, Sparkles, TrendingUp } from 'lucide-react'

export interface AIInsight {
  type: 'opportunity' | 'alert' | 'entity'
  text: string
}

export function InlineAICard({ insight }: { insight: AIInsight }) {
  const cfg = {
    opportunity: {
      icon: TrendingUp,
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-700',
      label: 'Opportunity Detected',
    },
    alert: {
      icon: AlertTriangle,
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-700',
      label: 'AI Alert',
    },
    entity: {
      icon: Sparkles,
      bg: 'bg-indigo-50',
      border: 'border-indigo-200',
      text: 'text-indigo-700',
      label: 'Entity Signal',
    },
  }[insight.type]
  const Icon = cfg.icon

  return (
    <div className={`mx-auto w-full max-w-md rounded-xl px-3.5 py-2.5 border shadow-sm ${cfg.bg} ${cfg.border} flex items-start gap-2.5`}>
      <div className="w-7 h-7 rounded-lg bg-white/70 border border-white/80 flex items-center justify-center flex-shrink-0">
        <Icon size={13} className={cfg.text} />
      </div>
      <div className="min-w-0">
        <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${cfg.text}`}>{cfg.label}</p>
        <p className="text-xs text-gray-700 leading-relaxed">{insight.text}</p>
      </div>
    </div>
  )
}
