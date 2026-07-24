'use client'

import { useState } from 'react'
import {
  Zap,
  Clock,
  CheckCircle2,
  Users,
  Share2,
  TrendingUp,
  X,
} from 'lucide-react'
import { getCalculatedRoiStats } from '@/lib/celebrations'
import { useToast } from '@/components/ui'

export function ExecutiveRoiSummary() {
  const stats = getCalculatedRoiStats()
  const { addToast } = useToast()
  const [showModal, setShowModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const summaryText = `📊 Zuri Weekly ROI Impact Report
• ${stats.messagesHandled} Messages processed collaboratively
• ${stats.hoursSaved}h Saved with AI co-pilot drafts
• ${stats.aiDraftsAccepted} AI reply suggestions accepted
• 100% SLA response health (0 missed messages)
• ${stats.synergyScore}% Team synergy rating`

  const handleCopy = () => {
    navigator.clipboard.writeText(summaryText)
    setCopied(true)
    addToast({
      variant: 'success',
      title: 'Report Copied to Clipboard',
      description: 'Ready to share with your executive team or stakeholders.',
    })
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        {/* Shimmer gradient header accent */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-500 to-indigo-600" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Past 7 Days</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">This Week’s Relationship Impact</h3>
            <p className="text-xs text-slate-500">
              Your team’s collaborative response velocity and AI co-pilot savings.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-200 hover:text-slate-950 transition-all shadow-sm flex-shrink-0"
          >
            <Share2 className="h-3.5 w-3.5 text-indigo-600" />
            Share Weekly ROI
          </button>
        </div>

        {/* Metric Cards Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-4">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Messages Handled</span>
              <Users className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{stats.messagesHandled}</p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> +18% vs last week
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Time Saved (AI)</span>
              <Clock className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{stats.hoursSaved}h</p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">
              {stats.aiDraftsAccepted} drafts approved
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>SLA Response Health</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-extrabold text-emerald-600 mt-1.5">100%</p>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">0 missed messages</p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
              <span>Team Synergy</span>
              <Zap className="h-4 w-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-extrabold text-slate-900 mt-1.5">{stats.synergyScore}%</p>
            <p className="text-[11px] text-emerald-600 font-semibold mt-0.5">Active collaboration</p>
          </div>
        </div>
      </div>

      {/* ROI Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl text-slate-900 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200/80">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Executive Weekly ROI Report</h3>
                  <p className="text-xs text-slate-500">Share productivity wins with leadership</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800 leading-relaxed whitespace-pre-wrap">
              {summaryText}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 shadow-md transition-all active:scale-95"
              >
                <span>{copied ? 'Copied!' : 'Copy Summary'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
