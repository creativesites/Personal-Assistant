import { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center px-6 py-16 ${className}`}>
      {icon && (
        <div className="mb-4 text-gray-300 text-5xl leading-none" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-gray-500 max-w-xs mb-6 leading-relaxed">{description}</p>
      )}
      {description && action && null}
      {!description && action && <div className="mb-4" />}
      {action}
    </div>
  )
}
