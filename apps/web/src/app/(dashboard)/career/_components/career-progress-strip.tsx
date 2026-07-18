'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'
import type { CareerOpportunity } from './opportunity-card'

// Career OS Living Companion redesign, Phase 5 (spec §12) — a compact
// completeness/progress strip sitting just below the hero card. Reuses
// GET /api/career/radar's already-computed sub-scores (portfolio → CV
// completeness, network → Networking, interviewReadiness → Interview
// readiness) rather than recomputing the same signals a second time —
// Applications count and Skills listed are the two genuinely new numbers,
// both cheap client-side reads off data the page already has loaded.

interface RadarSubScore {
  key: string
  score: number
}

interface Tile {
  label: string
  value: string
  score: number | null
}

function scoreColor(score: number | null): string {
  if (score == null) return 'text-gray-400'
  if (score >= 70) return 'text-emerald-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-rose-600'
}

export function CareerProgressStrip({
  token, opportunities, skillsCount,
}: {
  token: string
  opportunities: CareerOpportunity[]
  skillsCount: number
}) {
  const [subScores, setSubScores] = useState<RadarSubScore[] | null>(null)

  useEffect(() => {
    if (!token) return
    apiClient<{ subScores: RadarSubScore[] }>('/api/career/radar', { token })
      .then(d => setSubScores(d.subScores))
      .catch(() => {})
  }, [token])

  const scoreFor = (key: string) => subScores?.find(s => s.key === key)?.score ?? null
  const applicationsCount = opportunities.filter(o => ['applied', 'interviewing', 'offered'].includes(o.status)).length

  const tiles: Tile[] = [
    { label: 'CV', value: scoreFor('portfolio') != null ? `${scoreFor('portfolio')}%` : '—', score: scoreFor('portfolio') },
    { label: 'Networking', value: scoreFor('network') != null ? `${scoreFor('network')}%` : '—', score: scoreFor('network') },
    { label: 'Applications', value: String(applicationsCount), score: null },
    { label: 'Interview readiness', value: scoreFor('interviewReadiness') != null ? `${scoreFor('interviewReadiness')}%` : '—', score: scoreFor('interviewReadiness') },
    { label: 'Skills listed', value: String(skillsCount), score: null },
  ]

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {tiles.map(t => (
        <div key={t.label} className="rounded-2xl border border-white bg-white/95 px-3 py-2.5 shadow-sm shadow-gray-200/70 ring-1 ring-gray-100 text-center">
          <p className={`text-lg font-black tabular-nums ${scoreColor(t.score)}`}>{t.value}</p>
          <p className="text-[10px] font-semibold text-gray-500 mt-0.5 leading-tight">{t.label}</p>
        </div>
      ))}
    </div>
  )
}
