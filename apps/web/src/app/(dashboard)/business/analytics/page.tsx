'use client'

import React, { useState, useEffect } from 'react'
import {
  TrendingUp, Clock, DollarSign, Eye, Download, ShieldCheck, CheckCircle2, RefreshCw, Activity, AlertCircle, FileText
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { PageHeader } from '@/components/ui/page-header'

interface AnalyticsSummary {
  conversionRate: number
  totalQuotes: number
  closedQuotes: number
  receivablesAging: {
    currentCents: number
    days1To30Cents: number
    days31To60Cents: number
    days60PlusCents: number
    totalOutstandingCents: number
  }
  avgDaysToPayment: number
  engagementFeed: Array<{
    id: string
    event_type: string
    occurred_at: string
    metadata: any
    title: string
    document_number: string
    share_token: string
    contact_name: string | null
  }>
}

export default function DocumentAnalyticsPage() {
  const { data: sessionData } = useZuriSession()
  const token = sessionData?.accessToken

  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    apiClient<AnalyticsSummary>('/api/documents/analytics/summary', { token })
      .then(res => {
        setData(res)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center text-indigo-600 font-medium">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        <span>Loading Engagement Analytics...</span>
      </div>
    )
  }

  const aging = data?.receivablesAging
  const totalAging = aging?.totalOutstandingCents || 1

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 font-sans">
      <PageHeader
        title="Document Engagement & Financial Analytics"
        description="Monitor quote conversion rates, payment velocity, receivables aging, and real-time client view heatmaps."
      />

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Quote to Close */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-emerald-600">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Quote-to-Close</span>
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-900">{data?.conversionRate || 0}%</div>
          <p className="text-xs text-gray-500">{data?.closedQuotes || 0} of {data?.totalQuotes || 0} quotes converted</p>
        </div>

        {/* Avg Time to Payment */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-indigo-600">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Avg Payment Velocity</span>
            <Clock className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-900">{data?.avgDaysToPayment || 0} days</div>
          <p className="text-xs text-gray-500">Average days from issue to settled</p>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-amber-600">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Outstanding</span>
            <DollarSign className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-900">
            {((aging?.totalOutstandingCents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </div>
          <p className="text-xs text-gray-500">Unpaid invoice balances</p>
        </div>

        {/* Total Heatmap Activity */}
        <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm space-y-2">
          <div className="flex justify-between items-center text-purple-600">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Client Heatmap Events</span>
            <Activity className="w-5 h-5" />
          </div>
          <div className="text-2xl font-bold font-mono text-gray-900">{data?.engagementFeed.length || 0}</div>
          <p className="text-xs text-gray-500">Recent client interactions logged</p>
        </div>

      </div>

      {/* Receivables Aging Breakdown */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Receivables Aging Schedule</h2>
            <p className="text-xs text-gray-500">Categorization of overdue unpaid invoices by duration</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Current */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-600 uppercase">Current (Not Due)</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            </div>
            <div className="text-lg font-bold font-mono text-gray-900">
              {((aging?.currentCents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </div>
            <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full" style={{ width: `${((aging?.currentCents || 0) / totalAging) * 100}%` }} />
            </div>
          </div>

          {/* 1-30 Days */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-amber-800 uppercase">1 – 30 Days Overdue</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            </div>
            <div className="text-lg font-bold font-mono text-amber-900">
              {((aging?.days1To30Cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </div>
            <div className="w-full bg-amber-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-500 h-full" style={{ width: `${((aging?.days1To30Cents || 0) / totalAging) * 100}%` }} />
            </div>
          </div>

          {/* 31-60 Days */}
          <div className="p-4 rounded-xl border border-orange-200 bg-orange-50/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-orange-800 uppercase">31 – 60 Days Overdue</span>
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
            </div>
            <div className="text-lg font-bold font-mono text-orange-900">
              {((aging?.days31To60Cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </div>
            <div className="w-full bg-orange-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-orange-500 h-full" style={{ width: `${((aging?.days31To60Cents || 0) / totalAging) * 100}%` }} />
            </div>
          </div>

          {/* 60+ Days */}
          <div className="p-4 rounded-xl border border-red-200 bg-red-50/30 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-red-800 uppercase">60+ Days Overdue</span>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            </div>
            <div className="text-lg font-bold font-mono text-red-900">
              {((aging?.days60PlusCents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </div>
            <div className="w-full bg-red-200 h-1.5 rounded-full overflow-hidden">
              <div className="bg-red-500 h-full" style={{ width: `${((aging?.days60PlusCents || 0) / totalAging) * 100}%` }} />
            </div>
          </div>

        </div>
      </div>

      {/* Engagement Heatmap Activity Feed */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Document Activity Heatmap Feed</h2>
            <p className="text-xs text-gray-500">Real-time audit log of recipient opens, PDF downloads, signatures, and payments</p>
          </div>
        </div>

        <div className="divide-y divide-gray-100">
          {(!data?.engagementFeed || data.engagementFeed.length === 0) ? (
            <div className="py-8 text-center text-gray-400 text-sm">No recent document engagement activity recorded yet.</div>
          ) : (
            data.engagementFeed.map(evt => (
              <div key={evt.id} className="py-3.5 flex items-center justify-between text-xs hover:bg-gray-50/80 px-2 rounded-lg transition-colors">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    evt.event_type === 'signed' ? 'bg-emerald-100 text-emerald-700' :
                    evt.event_type === 'viewed' ? 'bg-indigo-100 text-indigo-700' :
                    evt.event_type === 'downloaded' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {evt.event_type === 'signed' && <ShieldCheck className="w-4 h-4" />}
                    {evt.event_type === 'viewed' && <Eye className="w-4 h-4" />}
                    {evt.event_type === 'downloaded' && <Download className="w-4 h-4" />}
                    {evt.event_type === 'generated' && <FileText className="w-4 h-4" />}
                  </div>

                  <div>
                    <p className="font-bold text-gray-900">
                      {evt.contact_name || 'Recipient'} {evt.event_type === 'signed' ? 'signed & accepted' : evt.event_type === 'viewed' ? 'opened public link for' : 'interacted with'} <span className="text-indigo-600 font-mono">{evt.document_number}</span>
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{evt.title}</p>
                  </div>
                </div>

                <span className="font-mono text-[10px] text-gray-400">
                  {new Date(evt.occurred_at).toLocaleString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  )
}
