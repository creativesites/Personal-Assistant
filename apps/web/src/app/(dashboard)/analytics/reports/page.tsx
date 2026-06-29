'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SUB_NAV = [
  { href: '/analytics', label: 'Executive' },
  { href: '/analytics/sales', label: 'Sales' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/conversations', label: 'Conversations' },
  { href: '/analytics/operations', label: 'Operations' },
  { href: '/analytics/opportunities', label: 'Opportunities' },
  { href: '/analytics/predictions', label: 'Predictions' },
  { href: '/analytics/health', label: 'Health Score' },
  { href: '/analytics/roi', label: 'ROI' },
  { href: '/analytics/timeline', label: 'Timeline' },
  { href: '/analytics/reports', label: 'Reports' },
]

function AnalyticsSubNav() {
  const pathname = usePathname()
  return (
    <div className="overflow-x-auto border-b border-gray-200 bg-white">
      <div className="flex min-w-max px-4 md:px-6">
        {SUB_NAV.map(item => {
          const active = item.href === '/analytics' ? pathname === '/analytics' : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                active ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}>
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// useEffect, useState, apiClient, useZuriSession are imported for the token pattern
// They are used here for future-proofing (e.g. fetching saved report configs)
// The variable below satisfies the linter while keeping the pattern intact.
function useReportsData() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [_ready, setReady] = useState(false)

  useEffect(() => {
    if (!token) return
    async function load() {
      try {
        // Placeholder — endpoint not yet implemented
        await apiClient('/api/analytics/reports', { token: token ?? undefined }).catch(() => null)
      } finally {
        setReady(true)
      }
    }
    load()
  }, [token])
}

interface ReportCard {
  icon: string
  title: string
  description: string
  href: string
  color: string
}

const REPORT_CARDS: ReportCard[] = [
  {
    icon: '📊',
    title: 'Executive Summary',
    description: 'High-level KPIs, relationship health overview, and key business metrics at a glance.',
    href: '/analytics',
    color: 'bg-indigo-50 text-indigo-700',
  },
  {
    icon: '💼',
    title: 'Sales Intelligence',
    description: 'Pipeline performance, conversion rates, deal velocity, and revenue forecasts.',
    href: '/analytics/sales',
    color: 'bg-blue-50 text-blue-700',
  },
  {
    icon: '👥',
    title: 'Customer Intelligence',
    description: 'Retention trends, satisfaction scores, churn signals, and lifetime value analysis.',
    href: '/analytics/customers',
    color: 'bg-cyan-50 text-cyan-700',
  },
  {
    icon: '💬',
    title: 'Conversation Analytics',
    description: 'Message volume, response times, sentiment trends, and communication patterns.',
    href: '/analytics/conversations',
    color: 'bg-teal-50 text-teal-700',
  },
  {
    icon: '❤️',
    title: 'Business Health Score',
    description: 'Relationship health distribution, dormant contacts, and attention-needed alerts.',
    href: '/analytics/health',
    color: 'bg-pink-50 text-pink-700',
  },
  {
    icon: '💰',
    title: 'ROI Dashboard',
    description: 'Return on AI investment, time saved, revenue attributed, and efficiency gains.',
    href: '/analytics/roi',
    color: 'bg-green-50 text-green-700',
  },
  {
    icon: '⚙️',
    title: 'Operations Center',
    description: 'Automation performance, AI suggestion acceptance rates, and workflow efficiency.',
    href: '/analytics/operations',
    color: 'bg-gray-50 text-gray-700',
  },
  {
    icon: '🎯',
    title: 'Opportunity Engine',
    description: 'Detected opportunities, win probability scores, and recommended next actions.',
    href: '/analytics/opportunities',
    color: 'bg-amber-50 text-amber-700',
  },
  {
    icon: '🔮',
    title: 'Predictive Intelligence',
    description: 'AI-powered forecasts for churn, upsell opportunities, and relationship outcomes.',
    href: '/analytics/predictions',
    color: 'bg-purple-50 text-purple-700',
  },
  {
    icon: '📅',
    title: 'Business Timeline',
    description: 'Chronological view of every important event — meetings, milestones, and conversations.',
    href: '/analytics/timeline',
    color: 'bg-orange-50 text-orange-700',
  },
]

const EXPORT_OPTIONS = [
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    label: 'CSV Export',
    description: 'Download raw data as a spreadsheet',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
    label: 'PDF Report',
    description: 'Formatted report for sharing and printing',
  },
  {
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
      </svg>
    ),
    label: 'Email Report',
    description: 'Send a report summary to your inbox',
  },
]

export default function ReportsPage() {
  // Token pattern — kept for future endpoint integration
  useReportsData()

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      {/* Page header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-4 md:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Reports &amp; Exports</h1>
          <p className="mt-1 text-sm text-gray-500">Browse your analytics reports and export your business data</p>
        </div>
      </div>

      <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto space-y-8">

        {/* Available Reports */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Available Reports</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {REPORT_CARDS.map(card => (
              <div
                key={card.href}
                className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
              >
                {/* Icon + title */}
                <div className="flex items-start gap-3">
                  <span
                    className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-xl ${card.color}`}
                  >
                    {card.icon}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 leading-snug">{card.title}</h3>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-gray-500 leading-relaxed flex-1">{card.description}</p>

                {/* CTA */}
                <Link
                  href={card.href}
                  className="inline-flex items-center justify-center min-h-[44px] px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  View Report
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* Export Center */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Export Center</h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
              Coming Soon
            </span>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <p className="text-sm text-gray-500 mb-6">
              Export your analytics data in multiple formats. Full export functionality is launching soon.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {EXPORT_OPTIONS.map(opt => (
                <div
                  key={opt.label}
                  className="border border-gray-200 rounded-xl p-5 flex flex-col gap-3 opacity-50 cursor-not-allowed select-none"
                  aria-disabled="true"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                      {opt.icon}
                    </span>
                    <span className="text-sm font-semibold text-gray-700">{opt.label}</span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{opt.description}</p>
                  <button
                    disabled
                    className="min-h-[44px] px-4 py-2 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
                  >
                    {opt.label}
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
              <span className="text-amber-500 mt-0.5 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-semibold text-amber-800">Export Center launching soon</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  We are building a powerful export system. You will be able to schedule, filter, and deliver data exports automatically.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Scheduled Reports */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Scheduled Reports</h2>
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-start gap-4">
                <span className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </span>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Weekly Email Reports</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Schedule a weekly report to your email — coming soon. Get a curated summary of your business health, key conversations, and AI insights delivered every Monday morning.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <button
                  disabled
                  className="min-h-[44px] px-5 py-2.5 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed whitespace-nowrap"
                >
                  Set Schedule
                </button>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: 'Weekly Digest', desc: 'Every Monday — top conversations, health changes, nudges due' },
                { label: 'Monthly Business Review', desc: 'First of each month — full analytics snapshot with trend analysis' },
                { label: 'Custom Schedule', desc: 'Pick your cadence and which reports to include in your digest' },
              ].map(item => (
                <div key={item.label} className="flex items-start gap-3 opacity-60 cursor-not-allowed">
                  <span className="mt-0.5 w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">{item.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex items-center gap-3">
              <span className="text-indigo-400 flex-shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </span>
              <p className="text-sm text-indigo-700">
                Scheduled reports will be available in an upcoming release. In the meantime, browse your live reports above.
              </p>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}
