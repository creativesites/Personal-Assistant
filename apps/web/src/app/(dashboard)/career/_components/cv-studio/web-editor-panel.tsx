'use client'

import { useEffect, useState } from 'react'
import { ArrowUp, ArrowDown, Eye, EyeOff, Loader2 } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui'

// CV Studio Phase 7 — Web Editor (docs/CV_STUDIO_PLAN.md §9, §18 Phase 7).
// Section reorder is up/down-arrow-based rather than true drag-and-drop —
// this codebase has no drag/sortable library anywhere yet, and pulling one
// in solely for this one panel isn't worth the new dependency; arrows are
// a fully working, keyboard-accessible reorder mechanism that needs none.

const SECTION_TYPES = [
  'summary', 'employment', 'education', 'certifications', 'skills',
  'projects', 'awards', 'volunteer', 'memberships', 'publications', 'references',
] as const

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary', employment: 'Employment History', education: 'Education',
  certifications: 'Certifications', skills: 'Skills', projects: 'Projects',
  awards: 'Awards', volunteer: 'Volunteer Work', memberships: 'Professional Memberships',
  publications: 'Publications', references: 'References',
}

interface CvSection {
  id?: string
  sectionType: string
  isVisible: boolean
  sortOrder: number
  customHeading: string | null
}

function defaultSections(): CvSection[] {
  return SECTION_TYPES.map((t, i) => ({ sectionType: t, isVisible: true, sortOrder: i, customHeading: null }))
}

export function WebEditorPanel({ cvId, token, onMutated }: { cvId: string; token: string; onMutated?: () => void }) {
  const { addToast } = useToast()
  const [sections, setSections] = useState<CvSection[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient<{ cv: unknown; sections: CvSection[] }>(`/api/career/cvs/${cvId}`, { token })
      .then(d => setSections(d.sections.length > 0 ? [...d.sections].sort((a, b) => a.sortOrder - b.sortOrder) : defaultSections()))
      .catch(() => setSections(defaultSections()))
  }, [cvId, token])

  const persist = async (next: CvSection[]) => {
    setSections(next)
    setSaving(true)
    try {
      await apiClient(`/api/career/cvs/${cvId}/sections`, {
        method: 'PUT', token,
        body: JSON.stringify({
          sections: next.map((s, i) => ({
            sectionType: s.sectionType, isVisible: s.isVisible, sortOrder: i, customHeading: s.customHeading,
          })),
        }),
      })
      onMutated?.()
    } catch (err) {
      addToast({ variant: 'error', title: 'Could not save section changes', description: err instanceof ApiError ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  const move = (index: number, direction: -1 | 1) => {
    if (!sections) return
    const target = index + direction
    if (target < 0 || target >= sections.length) return
    const next = [...sections]
    ;[next[index], next[target]] = [next[target], next[index]]
    persist(next)
  }

  const toggleVisible = (index: number) => {
    if (!sections) return
    const next = sections.map((s, i) => (i === index ? { ...s, isVisible: !s.isVisible } : s))
    persist(next)
  }

  const renameHeading = (index: number, heading: string) => {
    if (!sections) return
    const next = sections.map((s, i) => (i === index ? { ...s, customHeading: heading || null } : s))
    setSections(next)
  }

  const saveHeading = (index: number) => {
    if (!sections) return
    persist(sections)
  }

  if (!sections) return <Loader2 className="w-4 h-4 animate-spin text-gray-400" />

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 mb-2">Reorder, hide, or rename sections. Changes apply to this CV only.</p>
      {sections.map((s, i) => (
        <div key={s.sectionType} className="flex items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2 shadow-sm shadow-gray-200/70">
          <div className="flex flex-col">
            <button onClick={() => move(i, -1)} disabled={i === 0 || saving} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => move(i, 1)} disabled={i === sections.length - 1 || saving} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
          </div>
          <input
            value={s.customHeading ?? SECTION_LABELS[s.sectionType] ?? s.sectionType}
            onChange={e => renameHeading(i, e.target.value)}
            onBlur={() => saveHeading(i)}
            className="flex-1 text-sm text-gray-800 bg-transparent border-none focus:outline-none focus:ring-0 px-0"
          />
          <button onClick={() => toggleVisible(i)} disabled={saving} className={s.isVisible ? 'text-indigo-600' : 'text-gray-300'}>
            {s.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
        </div>
      ))}
    </div>
  )
}
