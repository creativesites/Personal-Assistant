export type WorkspaceMode = 'business' | 'personal' | 'hybrid'

interface ModeBadgeProps {
  mode: WorkspaceMode
  className?: string
}

const styles: Record<WorkspaceMode, { bg: string; text: string; label: string }> = {
  business: { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Business' },
  personal: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Personal' },
  hybrid:   { bg: 'bg-amber-100',  text: 'text-amber-800',  label: 'Hybrid'   },
}

const icons: Record<WorkspaceMode, string> = {
  business: '💼',
  personal: '👤',
  hybrid:   '⚡',
}

export function ModeBadge({ mode, className = '' }: ModeBadgeProps) {
  const s = styles[mode]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.text} ${className}`}>
      <span aria-hidden="true">{icons[mode]}</span>
      {s.label}
    </span>
  )
}
