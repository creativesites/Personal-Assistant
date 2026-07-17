'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Copy, Loader2, GitCompare } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// CV Studio Phase 7 — Version History (docs/CV_STUDIO_PLAN.md §10, §18
// Phase 7). Every PATCH to structuredContent already writes a new
// career_cv_versions row (Phase 1) — this panel is purely a reader/actor
// over that existing data, no new backend work needed beyond what Phase 1
// already shipped. "Compare" is a deliberate simplification: a plain
// side-by-side snapshot display, no line-level diff highlighting — an
// honest scope reduction rather than building a real diff algorithm for
// one panel, matching this codebase's "ship a real slice, document the
// rest" discipline.

interface CvVersion {
  id: string
  versionNumber: number
  snapshot: Record<string, unknown>
  createdAt: string
}

export function VersionHistoryPanel({ cvId, token, onRestored }: { cvId: string; token: string; onRestored?: () => void }) {
  const router = useRouter()
  const { addToast } = useToast()
  const [versions, setVersions] = useState<CvVersion[] | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [duplicating, setDuplicating] = useState(false)
  const [compareSelection, setCompareSelection] = useState<number[]>([])

  const load = () => {
    apiClient<{ versions: CvVersion[] }>(`/api/career/cvs/${cvId}/versions`, { token })
      .then(d => setVersions(d.versions))
      .catch(() => setVersions([]))
  }

  useEffect(() => { load() }, [cvId, token])

  const restore = async (versionNumber: number) => {
    setRestoring(versionNumber)
    try {
      await apiClient(`/api/career/cvs/${cvId}/versions/${versionNumber}/restore`, { method: 'POST', token })
      addToast({ variant: 'success', title: `Restored version ${versionNumber}` })
      load()
      onRestored?.()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not restore version', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setRestoring(null)
    }
  }

  const duplicate = async () => {
    setDuplicating(true)
    try {
      const result = await apiClient<{ cv: { id: string } }>(`/api/career/cvs/${cvId}/duplicate`, { method: 'POST', token })
      addToast({ variant: 'success', title: 'CV duplicated' })
      router.push(`/career/cv-studio/${result.cv.id}`)
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not duplicate CV', description: err instanceof ApiError ? err.message : undefined })
      setDuplicating(false)
    }
  }

  const toggleCompare = (versionNumber: number) => {
    setCompareSelection(prev => {
      if (prev.includes(versionNumber)) return prev.filter(v => v !== versionNumber)
      if (prev.length >= 2) return [prev[1], versionNumber]
      return [...prev, versionNumber]
    })
  }

  const compareVersions = (versions ?? [])
    .filter(v => compareSelection.includes(v.versionNumber))
    .sort((a, b) => a.versionNumber - b.versionNumber)

  if (!versions) return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">Every save creates a new version. Restoring copies an old version forward — nothing is ever lost.</p>
        <button
          onClick={duplicate}
          disabled={duplicating}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-2xl bg-indigo-50 text-indigo-700 px-3 py-1.5 text-xs font-bold hover:bg-indigo-100 disabled:opacity-60"
        >
          {duplicating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
          Duplicate CV
        </button>
      </div>

      {versions.length === 0 ? (
        <p className="text-xs text-gray-400">No versions yet — make an edit to create the first one.</p>
      ) : (
        <ul className="space-y-1.5">
          {versions.map(v => (
            <li key={v.id} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm shadow-gray-200/70">
              <input
                type="checkbox"
                checked={compareSelection.includes(v.versionNumber)}
                onChange={() => toggleCompare(v.versionNumber)}
                className="w-3.5 h-3.5"
                aria-label={`Select version ${v.versionNumber} to compare`}
              />
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-800">Version {v.versionNumber}</p>
                <p className="text-[10px] text-gray-400">{new Date(v.createdAt).toLocaleString()}</p>
              </div>
              <button
                onClick={() => restore(v.versionNumber)}
                disabled={restoring === v.versionNumber}
                className="inline-flex items-center gap-1 rounded-lg text-indigo-600 hover:text-indigo-800 text-xs font-semibold disabled:opacity-50"
              >
                {restoring === v.versionNumber ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}

      {compareSelection.length === 2 && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
          <p className="text-xs font-bold text-indigo-700 mb-2 inline-flex items-center gap-1">
            <GitCompare className="w-3.5 h-3.5" />
            Comparing versions {compareVersions[0]?.versionNumber} and {compareVersions[1]?.versionNumber}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {compareVersions.map(v => (
              <pre key={v.id} className="text-[10px] text-gray-600 bg-white rounded-lg p-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(v.snapshot, null, 2)}
              </pre>
            ))}
          </div>
        </div>
      )}
      {compareSelection.length === 1 && (
        <p className="text-[11px] text-gray-400">Select one more version to compare.</p>
      )}
    </div>
  )
}
