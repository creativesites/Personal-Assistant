'use client'

import { LayoutTemplate, Maximize2, Minimize2, Eye, Sparkles } from 'lucide-react'

export type CvTemplateKey = 'modern' | 'executive' | 'tech'
export type CvDensityMode = 'comfortable' | 'compact' | 'fit-1-page'

interface TemplateToolbarProps {
  templateKey: CvTemplateKey
  onSelectTemplate: (key: CvTemplateKey) => void
  densityMode: CvDensityMode
  onChangeDensity: (density: CvDensityMode) => void
  showPageBreaks: boolean
  onTogglePageBreaks: (show: boolean) => void
}

export function TemplateToolbar({
  templateKey,
  onSelectTemplate,
  densityMode,
  onChangeDensity,
  showPageBreaks,
  onTogglePageBreaks,
}: TemplateToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 mb-3 bg-white rounded-2xl border border-slate-200 shadow-sm text-xs">
      {/* Template Switcher */}
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-slate-700 flex items-center gap-1 mr-1">
          <LayoutTemplate className="w-3.5 h-3.5 text-indigo-600" />
          Template:
        </span>
        {[
          { id: 'modern', label: 'Modern' },
          { id: 'executive', label: 'Executive' },
          { id: 'tech', label: 'Tech Modern' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTemplate(t.id as CvTemplateKey)}
            className={`px-2.5 py-1.5 rounded-xl font-bold transition-all ${
              templateKey === t.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Density / 1-Page Fitter */}
      <div className="flex items-center gap-1.5">
        <span className="font-bold text-slate-700 flex items-center gap-1 mr-1">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          Density:
        </span>
        {[
          { id: 'comfortable', label: 'Normal' },
          { id: 'compact', label: 'Compact' },
          { id: 'fit-1-page', label: '⚡ Force 1-Page' },
        ].map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onChangeDensity(d.id as CvDensityMode)}
            className={`px-2.5 py-1.5 rounded-xl font-bold transition-all ${
              densityMode === d.id
                ? 'bg-slate-900 text-amber-300 shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Toggle Page Break Guide */}
      <button
        type="button"
        onClick={() => onTogglePageBreaks(!showPageBreaks)}
        className={`px-2.5 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1 ${
          showPageBreaks
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <Eye className="w-3.5 h-3.5" />
        <span>{showPageBreaks ? 'Hide Page Breaks' : 'Show Page Breaks'}</span>
      </button>
    </div>
  )
}
