'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { WizardShell } from '../../_components/cv-studio/wizard-shell'
import type { ProjectLink } from '../../_components/cv-studio/projects-step'

interface CvDetailResponse {
  cv: { id: string; title: string }
  sections: unknown[]
  projectLinks: ProjectLink[]
}

export default function CvStudioWizardPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const params = useParams<{ id: string }>()
  const [detail, setDetail] = useState<CvDetailResponse | null>(null)

  useEffect(() => {
    if (!token || !params.id) return
    apiClient<CvDetailResponse>(`/api/career/cvs/${params.id}`, { token }).then(setDetail).catch(() => setDetail(null))
  }, [token, params.id])

  if (!token || !detail) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)] flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <WizardShell cvId={params.id} token={token} initialProjectLinks={detail.projectLinks} />
    </div>
  )
}
