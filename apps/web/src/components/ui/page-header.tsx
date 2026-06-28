import { ReactNode } from 'react'
import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  description?: string
  breadcrumbs?: BreadcrumbItem[]
  action?: ReactNode
  className?: string
}

export function PageHeader({ title, description, breadcrumbs, action, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-200 bg-white ${className}`}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="flex items-center gap-1.5 mb-1 flex-wrap" aria-label="Breadcrumb">
            {breadcrumbs.map((item, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300 text-xs" aria-hidden="true">/</span>}
                {item.href
                  ? <Link href={item.href} className="text-xs text-gray-500 hover:text-gray-700 transition-colors">{item.label}</Link>
                  : <span className="text-xs text-gray-400">{item.label}</span>
                }
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-lg font-semibold text-gray-900 leading-tight truncate">{title}</h1>
        {description && (
          <p className="text-sm text-gray-500 mt-0.5">{description}</p>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
      )}
    </div>
  )
}
