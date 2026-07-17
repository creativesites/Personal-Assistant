'use client'

import { useEffect, useState } from 'react'
import { Radar as RadarIcon, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'

// Career & Growth Engine Phase 7 — Career Radar (docs/CAREER_GROWTH_ENGINE_PLAN.md
// §12). A 0-100 composite score with six sub-scores, each carrying its own
// one-line "why" and a concrete next action — never a bare number, matching
// the confidence-and-evidence discipline every other score in this codebase
// already commits to.

interface SubScore {
  key: string
  label: string
  score: number
  why: string
  nextAction: string
}

interface RadarData {
  overall: number
  subScores: SubScore[]
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-rose-600'
}

function barColor(score: number): string {
  if (score >= 70) return 'bg-emerald-500'
  if (score >= 40) return 'bg-amber-500'
  return 'bg-rose-500'
}

export function CareerRadar({ token }: { token: string }) {
  const [data, setData] = useState<RadarData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    apiClient<RadarData>('/api/career/radar', { token })
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0">
          <RadarIcon className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Career Radar</h2>
          <p className="text-[11px] text-gray-400">Your opportunity-readiness score</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-3xl font-black tracking-tight tabular-nums ${scoreColor(data.overall)}`}>{data.overall}</p>
          <p className="text-[10px] text-gray-400">/ 100</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
        {data.subScores.map(s => (
          <button
            key={s.key}
            onClick={() => setExpandedKey(prev => prev === s.key ? null : s.key)}
            className="text-left rounded-2xl bg-gray-50 hover:bg-gray-100 px-3 py-2.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-600">{s.label}</span>
              <span className={`text-sm font-black tabular-nums ${scoreColor(s.score)}`}>{s.score}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full rounded-full ${barColor(s.score)}`} style={{ width: `${s.score}%` }} />
            </div>
          </button>
        ))}
      </div>

      {expandedKey && (
        <div className="mt-3 rounded-xl bg-indigo-50 px-3 py-2.5">
          {(() => {
            const s = data.subScores.find(x => x.key === expandedKey)
            if (!s) return null
            return (
              <>
                <p className="text-xs text-indigo-900">{s.why}</p>
                <p className="text-xs font-semibold text-indigo-700 mt-1">→ {s.nextAction}</p>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
