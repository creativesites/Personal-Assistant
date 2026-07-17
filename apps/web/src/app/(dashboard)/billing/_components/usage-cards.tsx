'use client'

import { Bot, Briefcase, FileText, FolderKanban, Search, UserPlus, Wallet } from 'lucide-react'

export interface UsageSummary {
  periodStart: string
  counts: {
    documentsGenerated: number
    aiConversations: number
    projects: number
    customers: number
    jobsFound: number
    interviewsPrepared: number
    invoicesSent: number
  }
  hoursSavedEstimate: number
}

// Full literal class strings (not template-interpolated) so Tailwind's JIT
// scanner picks them up — see e.g. studio/_components/shared.ts for the
// same static-map convention this codebase already uses for badge colors.
const TILES: { key: keyof UsageSummary['counts']; label: string; icon: React.ElementType; chipClass: string }[] = [
  { key: 'aiConversations', label: 'AI conversations', icon: Bot, chipClass: 'bg-indigo-50 text-indigo-600' },
  { key: 'documentsGenerated', label: 'Documents generated', icon: FileText, chipClass: 'bg-cyan-50 text-cyan-600' },
  { key: 'projects', label: 'Projects', icon: FolderKanban, chipClass: 'bg-violet-50 text-violet-600' },
  { key: 'customers', label: 'New customers', icon: UserPlus, chipClass: 'bg-emerald-50 text-emerald-600' },
  { key: 'jobsFound', label: 'Job searches', icon: Search, chipClass: 'bg-blue-50 text-blue-600' },
  { key: 'interviewsPrepared', label: 'Interviews prepared', icon: Briefcase, chipClass: 'bg-amber-50 text-amber-600' },
  { key: 'invoicesSent', label: 'Invoices sent', icon: Wallet, chipClass: 'bg-rose-50 text-rose-600' },
]

// Membership Platform Phase 5 — the "beautiful usage cards" from the
// product brief, plus the "this period Zuri helped you..." narrative
// (an honestly-labeled estimate, not a measured figure).
export function UsageCards({ usage }: { usage: UsageSummary | null }) {
  if (!usage) return null
  const { counts, hoursSavedEstimate } = usage

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-gray-900">This period, Zuri helped you</p>
        {hoursSavedEstimate > 0 && (
          <span className="text-xs font-semibold text-indigo-600">~{hoursSavedEstimate}h saved (estimate)</span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {TILES.map(({ key, label, icon: Icon, chipClass }) => (
          <div
            key={key}
            className="rounded-3xl border border-white bg-white/95 p-4 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 hover:shadow-md transition-shadow"
          >
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-2 ${chipClass}`}>
              <Icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-black tracking-tight text-gray-950 tabular-nums">{counts[key]}</p>
            <p className="text-xs font-semibold text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
