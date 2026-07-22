'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, Briefcase, MapPin, Loader2 } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { Badge, Tabs, useToast } from '@/components/ui'
import { type CareerOpportunity } from '../../_components/opportunity-card'
import { ResumeMatchPanel, CompanyIntelligencePanel } from '../../_components/opportunity-insights'
import { CvTailoringPanel } from '../../_components/cv-tailoring-panel'

export default function SingleJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { addToast } = useToast()

  const [opp, setOpp] = useState<CareerOpportunity & { description?: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    setLoading(true)
    apiClient<{ opportunity: CareerOpportunity & { description?: string } }>(`/api/career/opportunities/${id}`, { token })
      .then(data => { setOpp(data.opportunity); setLoading(false) })
      .catch(() => setLoading(false))
  }, [token, id])

  if (loading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" /></div>
  }

  if (!opp) {
    return (
      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-6">
        <Link href="/career" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back to Career OS
        </Link>
        <div className="rounded-[2rem] border border-gray-200 bg-white p-8 text-center">
          <p className="font-bold text-gray-900">Opportunity not found</p>
        </div>
      </div>
    )
  }

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'intelligence', label: 'Zuri Intelligence' },
    { id: 'cv-studio', label: 'CV Studio' },
  ]

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 pb-20 space-y-6">
      <Link href="/career" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="rounded-[2rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{opp.title}</h1>
          <div className="flex flex-wrap gap-x-3 gap-y-2 text-sm text-gray-600 mt-2">
            {opp.companyOrOrg && <span className="inline-flex items-center gap-1"><Briefcase className="w-4 h-4" />{opp.companyOrOrg}</span>}
            {opp.location && <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4" />{opp.location}</span>}
            <Badge variant="purple">{opp.category.replace(/_/g, ' ')}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {opp.applicationUrl && (
            <a href={opp.applicationUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2 text-sm font-bold shadow-sm shadow-indigo-500/25 hover:bg-indigo-500">
              Apply <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      <div className="rounded-[2rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-2 md:p-6 min-h-[400px]">
        <Tabs tabs={TABS} defaultTab="overview">
          {(activeTab) => (
            <div className="pt-6">
              {activeTab === 'overview' && (
                <div className="space-y-6 px-2">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Job Description</h3>
                    <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {opp.description || 'No detailed description available.'}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'intelligence' && token && (
                <div className="space-y-6">
                  {opp.matchBreakdown && <ResumeMatchPanel opportunityId={opp.id} token={token} />}
                  <CompanyIntelligencePanel opportunityId={opp.id} token={token} companyOrOrg={opp.companyOrOrg} />
                </div>
              )}
              {activeTab === 'cv-studio' && token && (
                <div className="px-2">
                  <CvTailoringPanel opportunityId={opp.id} token={token} />
                </div>
              )}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  )
}
