'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Sparkles } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// CV Studio Phase 8 — Tailored CVs + Job Matching (docs/CV_STUDIO_PLAN.md
// §8, §11, §18 Phase 8). A new file alongside opportunity-insights.tsx
// rather than another panel piled into opportunity-card.tsx (already close
// to the File Architecture 500-line threshold) — same "one small file per
// sub-concern" convention that produced opportunity-insights.tsx itself.
// "Create Variant" (§3/§8) is career_cvs' existing sourceCvId/
// careerOpportunityId support from Phase 1 — no backend change needed here
// either, only a frontend entry point into it.

interface CvSummary {
  id: string
  title: string
  isMaster: boolean
  careerOpportunityId: string | null
}

interface CvMatchResult {
  matchScore: number
  requiredSkills: string[]
  missingSkills: string[]
}

interface TailoringSuggestion {
  type: string
  detail: string
}

export function CvTailoringPanel({ opportunityId, token }: { opportunityId: string; token: string }) {
  const router = useRouter()
  const { addToast } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [cvs, setCvs] = useState<CvSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [match, setMatch] = useState<CvMatchResult | null>(null)
  const [loadingMatch, setLoadingMatch] = useState(false)
  const [suggestions, setSuggestions] = useState<TailoringSuggestion[] | null>(null)
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  const variantCv = cvs?.find(c => c.careerOpportunityId === opportunityId) ?? null
  const masterCv = cvs?.find(c => c.isMaster) ?? cvs?.[0] ?? null

  const toggle = async () => {
    const next = !expanded
    setExpanded(next)
    if (next && cvs === null) {
      try {
        const data = await apiClient<{ cvs: CvSummary[] }>('/api/career/cvs', { token })
        setCvs(data.cvs)
      } catch {
        setCvs([])
      }
    }
  }

  const createVariant = async () => {
    if (!masterCv) {
      addToast({ variant: 'error', title: 'Build a CV in CV Studio first' })
      return
    }
    setCreating(true)
    try {
      const result = await apiClient<{ cv: { id: string } }>('/api/career/cvs', {
        method: 'POST', token,
        body: JSON.stringify({
          title: `Tailored CV — ${new Date().toLocaleDateString()}`,
          sourceCvId: masterCv.id,
          careerOpportunityId: opportunityId,
        }),
      })
      router.push(`/career/cv-studio/${result.cv.id}`)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not create a tailored CV', description: err instanceof ApiError ? err.message : undefined })
      setCreating(false)
    }
  }

  const loadMatch = async () => {
    if (!variantCv) return
    setLoadingMatch(true)
    try {
      setMatch(await apiClient<CvMatchResult>(`/api/career/opportunities/${opportunityId}/match/${variantCv.id}`, { token }))
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not compute job match', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setLoadingMatch(false)
    }
  }

  const loadSuggestions = async () => {
    if (!variantCv) return
    setLoadingSuggestions(true)
    try {
      const data = await apiClient<{ suggestions: TailoringSuggestion[] }>(
        `/api/career/opportunities/${opportunityId}/tailoring-suggestions?cvId=${variantCv.id}`, { token },
      )
      setSuggestions(data.suggestions)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not generate tailoring suggestions', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setLoadingSuggestions(false)
    }
  }

  return (
    <div>
      <button onClick={toggle} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
        <FileText className="w-3.5 h-3.5" />
        Tailored CV
      </button>
      {expanded && (
        <div className="mt-1.5 rounded-xl bg-indigo-50/60 px-3 py-2 space-y-2 text-[11px]">
          {cvs === null && <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />}

          {cvs !== null && !variantCv && (
            <button
              onClick={createVariant}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-60"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              Tailor a CV for this role
            </button>
          )}

          {variantCv && (
            <div className="space-y-2">
              <a href={`/career/cv-studio/${variantCv.id}`} className="font-semibold text-indigo-700 hover:text-indigo-800">
                {variantCv.title} →
              </a>

              {!match ? (
                <button onClick={loadMatch} disabled={loadingMatch} className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-800 disabled:opacity-60">
                  {loadingMatch && <Loader2 className="w-3 h-3 animate-spin" />}
                  Check match score
                </button>
              ) : (
                <div>
                  <p className="font-semibold text-gray-900">{match.matchScore}% match</p>
                  {match.missingSkills.length > 0 && (
                    <p className="text-rose-600">Missing: {match.missingSkills.join(', ')}</p>
                  )}
                </div>
              )}

              {!suggestions ? (
                <button onClick={loadSuggestions} disabled={loadingSuggestions} className="inline-flex items-center gap-1 font-semibold text-gray-600 hover:text-gray-800 disabled:opacity-60">
                  {loadingSuggestions && <Loader2 className="w-3 h-3 animate-spin" />}
                  Generate improvement suggestions
                </button>
              ) : suggestions.length === 0 ? (
                <p className="text-gray-500">No specific tailoring suggestions — this CV already looks well-aligned.</p>
              ) : (
                <ul className="space-y-1">
                  {suggestions.map((s, i) => <li key={i} className="text-gray-700">• {s.detail}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
