'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { useCareerProfile } from '../../../_components/cv-studio/use-career-profile'
import { WebEditorPanel } from '../../../_components/cv-studio/web-editor-panel'
import { VersionHistoryPanel } from '../../../_components/cv-studio/version-history-panel'
import { CvPreview } from '../../../_components/cv-studio/cv-preview'
import type { ProjectLink } from '../../../_components/cv-studio/projects-step'

// CV Studio Phase 7 — Web Editor (docs/CV_STUDIO_PLAN.md §9, §18 Phase 7).
// A distinct post-wizard page rather than a 15th wizard step, per the
// plan's own framing of the Web Editor as a separate editing mode (section
// layout + version history) that a user reaches once they already have
// content, not a step in the linear content-entry flow. Still
// live-preview-backed, same CvPreview component the wizard uses.

interface CvDetailResponse {
  cv: { id: string; title: string; templateKey: string }
  projectLinks: ProjectLink[]
}

export default function CvStudioEditorPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const params = useParams<{ id: string }>()
  const { profile } = useCareerProfile(token ?? '')
  const [detail, setDetail] = useState<CvDetailResponse | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!token || !params.id) return
    apiClient<CvDetailResponse>(`/api/career/cvs/${params.id}`, { token }).then(setDetail).catch(() => setDetail(null))
  }, [token, params.id])

  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  if (!token || !detail) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <Link href={`/career/cv-studio/${params.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />Back to wizard
          </Link>
          <h1 className="text-sm font-bold text-gray-900">{detail.cv.title} — Web Editor</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Layout</h2>
              <WebEditorPanel cvId={params.id} token={token} onMutated={bumpRefresh} />
            </div>
            <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
              <h2 className="text-sm font-bold text-gray-900 mb-3">Version History</h2>
              <VersionHistoryPanel cvId={params.id} token={token} onRestored={bumpRefresh} />
            </div>
          </div>

          <div>
            <CvPreview token={token} profile={profile} projectLinks={detail.projectLinks} refreshKey={refreshKey} />
          </div>
        </div>
      </div>
    </div>
  )
}
