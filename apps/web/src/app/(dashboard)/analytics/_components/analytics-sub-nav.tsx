'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

export const ANALYTICS_SUB_NAV = [
  { href: '/analytics', label: 'Executive' },
  { href: '/analytics/sales', label: 'Sales' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/conversations', label: 'Conversations' },
  { href: '/analytics/operations', label: 'Operations' },
  { href: '/analytics/opportunities', label: 'Opportunities' },
  { href: '/analytics/predictions', label: 'Predictions' },
  { href: '/analytics/health', label: 'Health Score' },
  { href: '/analytics/roi', label: 'ROI' },
  { href: '/analytics/campaigns', label: 'Campaigns' },
  { href: '/analytics/timeline', label: 'Timeline' },
  { href: '/analytics/reports', label: 'Reports' },
]

export function AnalyticsSubNav() {
  const pathname = usePathname()
  const activeRef = useRef<HTMLAnchorElement | null>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [pathname])

  return (
    <div className="sticky top-0 z-10 overflow-x-auto border-b border-slate-100 bg-white/90 backdrop-blur-xl px-2 py-2">
      <div className="flex min-w-max gap-1.5">
        {ANALYTICS_SUB_NAV.map((item) => {
          const active = item.href === '/analytics' ? pathname === '/analytics' : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              ref={active ? activeRef : undefined}
              className={`inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-2xl px-3.5 text-xs font-bold transition-all ${
                active
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
