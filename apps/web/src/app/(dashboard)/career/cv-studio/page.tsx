'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { FileText, Plus, ArrowLeft, Loader2 } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient, ApiError } from '@/lib/api'
import { Badge, EmptyState, useToast } from '@/components/ui'

// Zuri CV Studio (docs/CV_STUDIO_PLAN.md §2-§4, §18 Phase 4) — the entry
// point into the wizard. "Build New" creates a fresh master CV and drops
// straight into the wizard; existing CVs (master + any tailored variants,
// once Phase 8 ships variant creation) list here.

interface CvSummary {
  id: string
  title: string
  templateKey: string
  isMaster: boolean
  updatedAt: string
}

export default function CvStudioListPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const router = useRouter()
  const { addToast } = useToast()
  const [cvs, setCvs] = useState<CvSummary[] | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!token) return
    apiClient<{ cvs: CvSummary[] }>('/api/career/cvs', { token }).then(d => setCvs(d.cvs)).catch(() => setCvs([]))
  }, [token])

  const createCv = async (isMaster: boolean) => {
    if (!token) return
    setCreating(true)
    try {
      const result = await apiClient<{ cv: CvSummary }>('/api/career/cvs', {
        method: 'POST', token,
        body: JSON.stringify({ title: isMaster ? 'My CV' : `CV ${new Date().toLocaleDateString()}`, isMaster }),
      })
      router.push(`/career/cv-studio/${result.cv.id}`)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not create CV', description: err instanceof ApiError ? err.message : undefined })
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#eef2ff_0%,#f0fdfa_190px,#f8fafc_320px,#f8fafc_100%)]">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/career" className="inline-flex items-center gap-1 text-sm font-semibold text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft className="w-4 h-4" />Back to Career
        </Link>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-950 mb-1">CV Studio</h1>
        <p className="text-sm text-gray-500 mb-6">Build the best version of your real professional history — Zuri polishes, never invents.</p>

        {cvs === null ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
        ) : cvs.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" />}
            title="No CV yet"
            description="Build your Master CV — every future variant and generated document reads from it."
            action={
              <button
                onClick={() => createCv(true)}
                disabled={creating}
                className="inline-flex items-center gap-1.5 rounded-2xl bg-indigo-600 text-white px-4 py-2.5 text-sm font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-60 min-h-[44px]"
              >
                {creating ? 'Creating...' : 'Build New CV'}
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {cvs.map(cv => (
              <Link
                key={cv.id}
                href={`/career/cv-studio/${cv.id}`}
                className="flex items-center justify-between rounded-[1.75rem] border border-gray-100 bg-white shadow-sm shadow-gray-200/70 p-4 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{cv.title}</p>
                    <p className="text-xs text-gray-400">Updated {new Date(cv.updatedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                {cv.isMaster && <Badge variant="purple">Master</Badge>}
              </Link>
            ))}
            <button
              onClick={() => createCv(false)}
              disabled={creating}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />New CV
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
