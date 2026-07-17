'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Loader2, ShieldCheck } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// CV Studio Phase 6 — ATS Analysis + CV Health (docs/CV_STUDIO_PLAN.md §7,
// §18 Phase 6). CV Health is deterministic and loads automatically
// (cheap, no AI call); ATS Analysis reuses the existing SCORE_RESUME
// prompt and is triggered on demand since it's a real AI call.

interface CvHealthIssue {
  key: string
  description: string
  fixAction: string
  points: number
}

interface CvHealthResult {
  score: number
  issues: CvHealthIssue[]
}

interface AtsScoreResult {
  atsCompatibility: number
  recruiterAppeal: number
  technicalStrength: number
  achievementFraming: number
  formatting: number
  overallScore: number
  suggestions: { issue: string; fix: string; example: string }[]
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600'
  if (score >= 60) return 'text-amber-600'
  return 'text-rose-600'
}

export function CvHealthPanel({ cvId, token, refreshKey }: { cvId: string; token: string; refreshKey: number }) {
  const { addToast } = useToast()
  const [health, setHealth] = useState<CvHealthResult | null>(null)
  const [ats, setAts] = useState<AtsScoreResult | null>(null)
  const [loadingAts, setLoadingAts] = useState(false)

  useEffect(() => {
    apiClient<CvHealthResult>(`/api/career/cvs/${cvId}/health`, { token }).then(setHealth).catch(() => setHealth(null))
  }, [cvId, token, refreshKey])

  const runAtsAnalysis = async () => {
    setLoadingAts(true)
    try {
      const result = await apiClient<AtsScoreResult>(`/api/career/cvs/${cvId}/ats-score`, { method: 'POST', token })
      setAts(result)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not run ATS analysis', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setLoadingAts(false)
    }
  }

  return (
    <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-gray-900 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-indigo-600" />CV Health
        </h3>
        {health && <p className={`text-lg font-black tabular-nums ${scoreColor(health.score)}`}>{health.score}/100</p>}
      </div>

      {!health ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
      ) : health.issues.length === 0 ? (
        <p className="text-xs text-emerald-600 font-semibold">No issues found — looking strong.</p>
      ) : (
        <ul className="space-y-1.5">
          {health.issues.map(issue => (
            <li key={issue.key} className="text-xs text-gray-600">
              <span className="text-rose-600 font-semibold">•</span> {issue.description}
              <span className="text-gray-400"> — {issue.fixAction}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 pt-4 border-t border-gray-50">
        <button
          onClick={runAtsAnalysis}
          disabled={loadingAts}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-50 text-indigo-700 px-3 py-1.5 text-xs font-bold hover:bg-indigo-100 disabled:opacity-60"
        >
          {loadingAts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          Run ATS Analysis
        </button>

        {ats && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                ['Overall', ats.overallScore], ['ATS', ats.atsCompatibility], ['Recruiter', ats.recruiterAppeal],
                ['Technical', ats.technicalStrength], ['Achievements', ats.achievementFraming], ['Formatting', ats.formatting],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-gray-50 px-2.5 py-2 text-center">
                  <p className={`text-sm font-black tabular-nums ${scoreColor(value as number)}`}>{value}</p>
                  <p className="text-[10px] text-gray-500">{label}</p>
                </div>
              ))}
            </div>
            {ats.suggestions.length > 0 && (
              <ul className="space-y-1.5 pt-1">
                {ats.suggestions.map((s, i) => (
                  <li key={i} className="text-xs text-gray-600">
                    <span className="font-semibold text-gray-800">{s.issue}</span> — {s.fix}
                    {s.example && <span className="italic text-gray-400"> (e.g. "{s.example}")</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
