import { ReactNode } from 'react'

export type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'purple'

interface BadgeProps {
  variant?: BadgeVariant
  dot?: boolean
  removable?: boolean
  onRemove?: () => void
  children: ReactNode
  className?: string
}

const styles: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-800',
  warning: 'bg-amber-100 text-amber-800',
  error:   'bg-red-100 text-red-800',
  info:    'bg-blue-100 text-blue-800',
  purple:  'bg-purple-100 text-purple-800',
}

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-gray-400',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
  info:    'bg-blue-500',
  purple:  'bg-purple-500',
}

export function Badge({ variant = 'default', dot = false, removable = false, onRemove, children, className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[variant]} ${className}`}>
      {dot && (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColors[variant]}`} aria-hidden="true" />
      )}
      {children}
      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 -mr-0.5 rounded-full p-0.5 hover:bg-black/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          aria-label="Remove"
        >
          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      )}
    </span>
  )
}
