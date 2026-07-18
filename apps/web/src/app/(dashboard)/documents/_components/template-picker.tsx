'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { apiClient } from '@/lib/api'

// A grid of small CSS-mockup preview cards — not server-rendered PDF
// thumbnails, since no thumbnail-rendering infra exists and rasterizing a
// real PDF per template per pick is unnecessary cost for a one-time
// selection. Each mockup hints at that layout_key's real visual language
// (color-bar position, columns) via MOCKUP_STYLE; anything without a match
// falls back to a plain generic mockup so a newly-added system template
// still renders something reasonable before this map is updated for it.

export interface DocumentTemplate {
  id: string
  name: string
  layoutKey: string
  category: string | null
  applicableTo: string[] | null
  isSystem: boolean
}

function TemplateMockup({ layoutKey }: { layoutKey: string }) {
  switch (layoutKey) {
    case 'modern':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col">
          <div className="h-3 bg-indigo-500" />
          <div className="flex-1 p-2 space-y-1">
            <div className="h-1.5 w-1/2 bg-gray-300 rounded" />
            <div className="h-1 w-1/3 bg-gray-200 rounded" />
            <div className="mt-2 space-y-0.5">
              <div className="h-1 w-full bg-gray-100 rounded" />
              <div className="h-1 w-full bg-gray-100 rounded" />
              <div className="h-1 w-2/3 bg-gray-100 rounded" />
            </div>
          </div>
        </div>
      )
    case 'classic':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col p-2">
          <div className="h-1.5 w-1/3 bg-gray-700 rounded mx-auto" />
          <div className="h-px w-full bg-gray-300 my-2" />
          <div className="space-y-0.5 flex-1">
            <div className="h-1 w-full bg-gray-100 rounded" />
            <div className="h-1 w-full bg-gray-100 rounded" />
            <div className="h-1 w-2/3 bg-gray-100 rounded" />
          </div>
        </div>
      )
    case 'corporate':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col">
          <div className="h-5 bg-slate-800 flex items-center px-2"><div className="h-1.5 w-1/3 bg-white/70 rounded" /></div>
          <div className="flex-1 p-2 space-y-1">
            <div className="h-1 w-full bg-gray-100 rounded" />
            <div className="h-1 w-full bg-gray-100 rounded" />
            <div className="h-1 w-1/2 bg-gray-100 rounded" />
          </div>
        </div>
      )
    case 'elegant':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col p-3">
          <div className="h-1 w-1/4 bg-gray-400 rounded" />
          <div className="mt-3 space-y-1.5 flex-1">
            <div className="h-0.5 w-full bg-gray-100 rounded" />
            <div className="h-0.5 w-full bg-gray-100 rounded" />
          </div>
        </div>
      )
    case 'compact':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col p-1.5">
          <div className="h-1 w-1/3 bg-gray-400 rounded" />
          <div className="mt-1 space-y-0.5 flex-1">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-0.5 w-full bg-gray-100 rounded" />)}
          </div>
        </div>
      )
    case 'creative':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex">
          <div className="w-1/3 bg-violet-500" />
          <div className="flex-1 p-2 space-y-1">
            <div className="h-1.5 w-2/3 bg-gray-300 rounded" />
            <div className="h-1 w-full bg-gray-100 rounded mt-2" />
            <div className="h-1 w-full bg-gray-100 rounded" />
          </div>
        </div>
      )
    case 'executive':
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col">
          <div className="h-4 bg-gray-900" />
          <div className="flex-1 p-2 space-y-1">
            <div className="h-1.5 w-1/2 bg-gray-300 rounded" />
            <div className="h-1 w-full bg-gray-100 rounded mt-2" />
            <div className="h-1 w-full bg-gray-100 rounded" />
          </div>
        </div>
      )
    case 'minimal':
    default:
      return (
        <div className="w-full h-full bg-white rounded-md overflow-hidden flex flex-col p-2">
          <div className="h-1.5 w-1/2 bg-gray-300 rounded" />
          <div className="h-1 w-1/3 bg-gray-200 rounded mt-1" />
          <div className="mt-2 space-y-0.5">
            <div className="h-1 w-full bg-gray-100 rounded" />
            <div className="h-1 w-full bg-gray-100 rounded" />
          </div>
        </div>
      )
  }
}

export function TemplatePicker({
  token, value, onChange,
}: { token?: string; value: string | null; onChange: (templateId: string) => void }) {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])

  useEffect(() => {
    if (!token) return
    apiClient<{ templates: DocumentTemplate[] }>('/api/document-templates', { token })
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => setTemplates([]))
  }, [token])

  if (templates.length === 0) return null

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-2">Template</label>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {templates.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl border p-1.5 min-h-11 ${
              value === t.id ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="w-full aspect-[3/4] bg-gray-50 rounded-md border border-gray-100 overflow-hidden">
              <TemplateMockup layoutKey={t.layoutKey} />
            </div>
            <span className="text-[11px] font-medium text-gray-700 truncate w-full text-center">{t.name}</span>
            {value === t.id && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                <Check className="w-2.5 h-2.5" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
