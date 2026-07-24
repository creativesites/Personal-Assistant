'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ArrowLeft, Loader2, Eye, Target, Wand2, Layers, History, Globe } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { useCareerProfile } from '../../../_components/cv-studio/use-career-profile'
import { WebEditorPanel } from '../../../_components/cv-studio/web-editor-panel'
import { VersionHistoryPanel } from '../../../_components/cv-studio/version-history-panel'
import { CvPreview } from '../../../_components/cv-studio/cv-preview'
import { AtsMatchEngine } from '../../../_components/cv-studio/ats-match-engine'
import { BulletTransformer } from '../../../_components/cv-studio/bullet-transformer'
import { TemplateToolbar, type CvTemplateKey, type CvDensityMode } from '../../../_components/cv-studio/template-toolbar'
import { PortfolioStudioPanel } from '../../../_components/portfolio-studio-panel'
import type { ProjectLink } from '../../../_components/cv-studio/projects-step'

const CvPdfPreviewModal = dynamic(() => import('@/components/documents/CvPdfPreviewModal'), { ssr: false })

interface CvDetailResponse {
  cv: { id: string; title: string; templateKey: string }
  projectLinks: ProjectLink[]
}

export default function CvStudioEditorPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const params = useParams<{ id: string }>()
  const { profile, updateField } = useCareerProfile(token ?? '')
  const [detail, setDetail] = useState<CvDetailResponse | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showPdfPreview, setShowPdfPreview] = useState(false)
  const [activeTab, setActiveTab] = useState<'ats' | 'bullet' | 'layout' | 'history' | 'portfolio'>('ats')

  // Pillar 2 Template & Density State
  const [templateKey, setTemplateKey] = useState<CvTemplateKey>('modern')
  const [densityMode, setDensityMode] = useState<CvDensityMode>('comfortable')
  const [showPageBreaks, setShowPageBreaks] = useState(true)

  useEffect(() => {
    if (!token || !params.id) return
    apiClient<CvDetailResponse>(`/api/career/cvs/${params.id}`, { token })
      .then((res) => {
        setDetail(res)
        if (res.cv.templateKey && ['modern', 'executive', 'tech'].includes(res.cv.templateKey)) {
          setTemplateKey(res.cv.templateKey as CvTemplateKey)
        }
      })
      .catch(() => setDetail(null))
  }, [token, params.id])

  const bumpRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  if (!token || !detail) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // Construct text representation of CV for ATS matching
  const cvTextContent = profile
    ? `${profile.fullName || ''} ${profile.summary || ''} ${profile.skills?.join(' ') || ''}`
    : detail.cv.title

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <Link href={`/career/cv-studio/${params.id}`} className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />Back to wizard
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold text-gray-900">{detail.cv.title} — Web Editor & ATS Studio</h1>
            <button
              onClick={() => setShowPdfPreview(true)}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-3.5 py-1.5 text-xs font-bold shadow-sm hover:bg-indigo-700 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            {/* Studio Navigation Tabs */}
            <div className="flex rounded-2xl bg-white border border-slate-200 p-1 shadow-sm overflow-x-auto">
              {[
                { id: 'ats', label: 'ATS Match', icon: Target },
                { id: 'bullet', label: 'Bullet Rewrite', icon: Wand2 },
                { id: 'layout', label: 'Layout', icon: Layers },
                { id: 'portfolio', label: 'Web Portfolio', icon: Globe },
                { id: 'history', label: 'History', icon: History },
              ].map((t) => {
                const Icon = t.icon
                const active = activeTab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id as any)}
                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 whitespace-nowrap px-2 ${
                      active
                        ? 'bg-slate-900 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Active Tab Panel */}
            {activeTab === 'ats' && (
              <AtsMatchEngine
                cvId={params.id}
                token={token}
                cvTextContent={cvTextContent}
              />
            )}

            {activeTab === 'bullet' && (
              <BulletTransformer
                token={token}
                initialText=""
              />
            )}

            {activeTab === 'layout' && (
              <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-3">Layout & Section Order</h2>
                <WebEditorPanel cvId={params.id} token={token} onMutated={bumpRefresh} />
              </div>
            )}

            {activeTab === 'portfolio' && (
              <PortfolioStudioPanel token={token} />
            )}

            {activeTab === 'history' && (
              <div className="rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-5">
                <h2 className="text-sm font-bold text-gray-900 mb-3">Version History</h2>
                <VersionHistoryPanel cvId={params.id} token={token} onRestored={bumpRefresh} />
              </div>
            )}
          </div>

          <div>
            <TemplateToolbar
              templateKey={templateKey}
              onSelectTemplate={setTemplateKey}
              densityMode={densityMode}
              onChangeDensity={setDensityMode}
              showPageBreaks={showPageBreaks}
              onTogglePageBreaks={setShowPageBreaks}
            />
            <CvPreview
              token={token}
              profile={profile}
              projectLinks={detail.projectLinks}
              refreshKey={refreshKey}
              templateKey={templateKey}
              densityMode={densityMode}
              showPageBreaks={showPageBreaks}
              isEditable={true}
              onUpdateProfileField={updateField}
            />
          </div>
        </div>
      </div>

      <CvPdfPreviewModal
        open={showPdfPreview}
        onClose={() => setShowPdfPreview(false)}
        cvId={params.id}
        cvTitle={detail.cv.title}
        token={token}
      />
    </div>
  )
}
