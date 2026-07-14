'use client'

import { useEffect, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import Link from 'next/link'
import { AnalyticsSubNav } from '../_components/analytics-sub-nav'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChurnRiskContact {
  id: string
  contactId: string
  name: string
  healthScore: number
  daysSinceContact: number
  riskLevel: 'high' | 'medium' | 'low'
}

interface BuyingSignalContact {
  id: string
  contactId: string
  name: string
  leadScore: number
  stage: 'cold' | 'warm' | 'hot' | string
  signals: string[]
}

interface PeakHour {
  hour: number
  messageCount: number
}

interface FollowUpContact {
  id: string
  contactId: string
  name: string
  daysSinceContact: number
  urgency: 'high' | 'medium' | 'low'
}

interface PredictionsData {
  insights: string[]
  churnRisk: ChurnRiskContact[]
  buyingSignals: BuyingSignalContact[]
  peakHours: PeakHour[]
  followUpNeeded: FollowUpContact[]
  generatedAt?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function riskMeta(level: 'high' | 'medium' | 'low'): { label: string; bg: string; text: string; border: string } {
  switch (level) {
    case 'high':
      return { label: 'High risk', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
    case 'medium':
      return { label: 'Medium risk', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' }
    case 'low':
      return { label: 'Low risk', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200' }
  }
}

function urgencyMeta(urgency: 'high' | 'medium' | 'low'): { label: string; bg: string; text: string; border: string; dot: string } {
  switch (urgency) {
    case 'high':
      return { label: 'Urgent', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' }
    case 'medium':
      return { label: 'Soon', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-400' }
    case 'low':
      return { label: 'When able', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', dot: 'bg-sky-400' }
  }
}

function stageMeta(stage: string): { label: string; bg: string; text: string } {
  switch (stage) {
    case 'hot':  return { label: 'Hot',  bg: 'bg-red-50',    text: 'text-red-700' }
    case 'warm': return { label: 'Warm', bg: 'bg-amber-50',  text: 'text-amber-700' }
    case 'cold': return { label: 'Cold', bg: 'bg-blue-50',   text: 'text-blue-700' }
    default:     return { label: stage,  bg: 'bg-gray-50',   text: 'text-gray-700' }
  }
}

function healthScoreColor(score: number): { bar: string; text: string } {
  if (score >= 70) return { bar: 'bg-emerald-500', text: 'text-emerald-700' }
  if (score >= 50) return { bar: 'bg-amber-400',   text: 'text-amber-700' }
  return { bar: 'bg-rose-500', text: 'text-rose-700' }
}

function leadScoreColor(score: number): string {
  if (score > 80) return 'bg-emerald-500'
  if (score > 60) return 'bg-amber-400'
  return 'bg-rose-500'
}

function fmtHour(h: number): string {
  if (h === 0) return '12am'
  if (h < 12) return `${h}am`
  if (h === 12) return '12pm'
  return `${h - 12}pm`
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] ?? '')
    .join('')
    .toUpperCase()
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
}

function InsightsSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {[0, 1, 2].map(i => (
        <div key={i} className="flex-shrink-0 w-64 bg-white border border-gray-200 rounded-xl p-4">
          <Skeleton className="w-6 h-6 rounded mb-3" />
          <Skeleton className="h-3 w-full mb-2" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-6 py-4 flex items-center gap-4">
            <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
            <div className="flex-1">
              <Skeleton className="h-3 w-28 mb-2" />
              <Skeleton className="h-2.5 w-40" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function PeakHoursSkeleton() {
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <Skeleton className="h-4 w-40 mb-6" />
      <div className="flex items-end gap-1 h-24">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-200 rounded-t animate-pulse"
            style={{ height: `${20 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// AI Insights cards (horizontal scroll on mobile)
// ---------------------------------------------------------------------------

function InsightCard({ text }: { text: string }) {
  return (
    <div className="flex-shrink-0 w-72 sm:w-80 bg-white border border-gray-200 shadow-sm rounded-xl p-4 flex gap-3">
      {/* Lightbulb icon — pure SVG, no external dep */}
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-indigo-50" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M8 1a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V10a.5.5 0 0 1-.5.5h-3A.5.5 0 0 1 6 10V8.5C4.8 7.8 4 6.5 4 5a4 4 0 0 1 4-4Z"
            fill="#6366f1"
          />
          <path
            d="M6.5 11.5h3v.5a1.5 1.5 0 0 1-3 0v-.5Z"
            fill="#a5b4fc"
          />
        </svg>
      </div>
      <p className="text-sm text-gray-700 leading-relaxed">{text}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Churn risk row
// ---------------------------------------------------------------------------

function ChurnRiskRow({ contact }: { contact: ChurnRiskContact }) {
  const risk = riskMeta(contact.riskLevel)
  const health = healthScoreColor(contact.healthScore)
  return (
    <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
      {/* Avatar */}
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-rose-50 text-rose-700 text-xs font-bold select-none"
        aria-hidden="true"
      >
        {initials(contact.name)}
      </div>
      {/* Name + health bar */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${health.bar} rounded-full`}
              style={{ width: `${Math.min(contact.healthScore, 100)}%` }}
            />
          </div>
          <span className={`text-xs font-medium ${health.text}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {contact.healthScore}
          </span>
        </div>
      </div>
      {/* Days since contact */}
      <div className="flex-shrink-0 text-right hidden sm:block">
        <p className="text-xs text-gray-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {contact.daysSinceContact}d since contact
        </p>
      </div>
      {/* Risk badge */}
      <span
        className={`flex-shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${risk.bg} ${risk.text} ${risk.border}`}
      >
        {risk.label}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Buying signal card
// ---------------------------------------------------------------------------

function BuyingSignalCard({ contact }: { contact: BuyingSignalContact }) {
  const stage = stageMeta(contact.stage)
  const barColor = leadScoreColor(contact.leadScore)
  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold select-none"
            aria-hidden="true"
          >
            {initials(contact.name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
            <span className={`inline-flex items-center mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${stage.bg} ${stage.text}`}>
              {stage.label}
            </span>
          </div>
        </div>
        {/* Lead score ring area */}
        <div className="flex-shrink-0 text-right">
          <p className="text-xs text-gray-400 mb-1">Score</p>
          <p
            className="text-lg font-bold text-gray-900"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {contact.leadScore}
          </p>
        </div>
      </div>
      {/* Score bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} rounded-full`}
          style={{ width: `${Math.min(contact.leadScore, 100)}%`, transition: 'width 0.5s ease' }}
        />
      </div>
      {/* Signals */}
      {contact.signals && contact.signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {contact.signals.map((signal, idx) => (
            <span
              key={idx}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
            >
              {signal}
            </span>
          ))}
        </div>
      )}
      <Link
        href={`/contacts/${contact.contactId}`}
        className="inline-flex items-center justify-center h-9 px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors self-start min-h-[36px]"
      >
        View Contact
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peak hours bar chart (pure CSS)
// ---------------------------------------------------------------------------

function PeakHoursChart({ peakHours }: { peakHours: PeakHour[] }) {
  // Build a full 24-slot array, filling in zeros for missing hours
  const slots: PeakHour[] = Array.from({ length: 24 }, (_, hour) => {
    const found = peakHours.find(p => p.hour === hour)
    return found ?? { hour, messageCount: 0 }
  })

  const maxCount = Math.max(...slots.map(s => s.messageCount), 1)
  const peakHour = slots.reduce((a, b) => (b.messageCount > a.messageCount ? b : a), slots[0])

  // Show only every 3rd hour as a label to keep things readable
  const showLabel = (h: number) => h % 3 === 0

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Peak Messaging Hours</h2>
          <p className="text-xs text-gray-500 mt-0.5">Message volume by hour of day</p>
        </div>
        {peakHour && peakHour.messageCount > 0 && (
          <div className="text-right flex-shrink-0">
            <p className="text-xs text-gray-500">Peak hour</p>
            <p className="text-sm font-bold text-indigo-600">{fmtHour(peakHour.hour)}</p>
          </div>
        )}
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-0.5 h-20" role="img" aria-label="Message volume by hour">
        {slots.map(slot => {
          const pct = maxCount > 0 ? (slot.messageCount / maxCount) * 100 : 0
          const isPeak = slot.hour === peakHour?.hour && slot.messageCount > 0
          return (
            <div
              key={slot.hour}
              className="flex-1 flex flex-col justify-end group relative"
              title={`${fmtHour(slot.hour)}: ${slot.messageCount} messages`}
            >
              <div
                className={`w-full rounded-t transition-all duration-500 ${
                  isPeak ? 'bg-indigo-500' : 'bg-indigo-200 group-hover:bg-indigo-300'
                }`}
                style={{ height: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
              />
            </div>
          )
        })}
      </div>

      {/* Hour labels — only every 3 hours */}
      <div className="flex mt-1.5">
        {slots.map(slot => (
          <div key={slot.hour} className="flex-1 text-center">
            {showLabel(slot.hour) && (
              <span
                className="text-[10px] text-gray-400 select-none"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {fmtHour(slot.hour)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Follow-up needed row
// ---------------------------------------------------------------------------

function FollowUpRow({ contact }: { contact: FollowUpContact }) {
  const urg = urgencyMeta(contact.urgency)
  return (
    <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 text-gray-600 text-xs font-bold select-none"
        aria-hidden="true"
      >
        {initials(contact.name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{fmtDate(contact.daysSinceContact)}</p>
      </div>
      <span
        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${urg.bg} ${urg.text} ${urg.border}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${urg.dot}`} />
        {urg.label}
      </span>
      <Link
        href={`/contacts/${contact.contactId}`}
        className="flex-shrink-0 inline-flex items-center justify-center h-9 px-3 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors min-h-[36px]"
      >
        View
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title, subtitle, count }: { title: string; subtitle?: string; count?: number }) {
  return (
    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {count !== undefined && count > 0 && (
        <span
          className="flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {count}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty sub-state
// ---------------------------------------------------------------------------

function SubEmpty({ message }: { message: string }) {
  return (
    <div className="px-6 py-8 text-center text-sm text-gray-400">{message}</div>
  )
}

// ---------------------------------------------------------------------------
// Fallback / empty data
// ---------------------------------------------------------------------------

function buildFallback(): PredictionsData {
  return {
    insights: [],
    churnRisk: [],
    buyingSignals: [],
    peakHours: [],
    followUpNeeded: [],
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PredictionsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [data, setData] = useState<PredictionsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const res = await apiClient('/api/analytics/predictions', { token: token ?? undefined })
        if (!cancelled) setData((res as PredictionsData) ?? buildFallback())
      } catch {
        if (!cancelled) setData(buildFallback())
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  const d = data ?? buildFallback()

  return (
    <div className="min-h-screen bg-gray-50">
      <AnalyticsSubNav />

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Predictive Intelligence</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI-powered predictions about your business</p>
        </div>

        {/* ── AI Insights (horizontal scroll on mobile) ────────────── */}
        <div>
          <p
            className="text-xs font-semibold text-gray-500 uppercase mb-3"
            style={{ letterSpacing: '0.07em' }}
          >
            AI Insights
          </p>
          {loading ? (
            <InsightsSkeleton />
          ) : d.insights.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:-mx-6 md:px-6 snap-x snap-mandatory">
              {d.insights.map((text, idx) => (
                <div key={idx} className="snap-start">
                  <InsightCard text={text} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-3">
              <div className="w-72 sm:w-80 bg-white border border-gray-200 rounded-xl p-4 flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-50" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 1a4 4 0 0 1 4 4c0 1.5-.8 2.8-2 3.5V10a.5.5 0 0 1-.5.5h-3A.5.5 0 0 1 6 10V8.5C4.8 7.8 4 6.5 4 5a4 4 0 0 1 4-4Z" fill="#d1d5db" />
                    <path d="M6.5 11.5h3v.5a1.5 1.5 0 0 1-3 0v-.5Z" fill="#e5e7eb" />
                  </svg>
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  Insights will appear here as Zuri analyses your conversation patterns.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── Churn Risk ───────────────────────────────────────────── */}
        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
            <SectionHeader
              title="Churn Risk"
              subtitle="Contacts at risk of going cold"
              count={d.churnRisk.length}
            />
            {d.churnRisk.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {d.churnRisk.map(contact => (
                  <ChurnRiskRow key={contact.id} contact={contact} />
                ))}
              </div>
            ) : (
              <SubEmpty message="No churn risks detected — your relationships look healthy." />
            )}
          </div>
        )}

        {/* ── Buying Signals ───────────────────────────────────────── */}
        {loading ? (
          <div>
            <Skeleton className="h-4 w-36 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                    <div>
                      <Skeleton className="h-3 w-24 mb-2" />
                      <Skeleton className="h-4 w-14 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                  <div className="flex gap-1.5">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : d.buyingSignals.length > 0 ? (
          <div>
            <p
              className="text-xs font-semibold text-gray-500 uppercase mb-3"
              style={{ letterSpacing: '0.07em' }}
            >
              Buying Signals
              <span
                className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {d.buyingSignals.length}
              </span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {d.buyingSignals.map(contact => (
                <BuyingSignalCard key={contact.id} contact={contact} />
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
            <SectionHeader title="Buying Signals" subtitle="Contacts showing purchase intent" />
            <SubEmpty message="No buying signals detected yet — they will appear as leads engage more." />
          </div>
        )}

        {/* ── Peak Hours ───────────────────────────────────────────── */}
        {loading ? (
          <PeakHoursSkeleton />
        ) : (
          <PeakHoursChart peakHours={d.peakHours} />
        )}

        {/* ── Follow-up Needed ─────────────────────────────────────── */}
        {loading ? (
          <TableSkeleton rows={5} />
        ) : (
          <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
            <SectionHeader
              title="Follow-up Needed"
              subtitle="Contacts that need attention soon"
              count={d.followUpNeeded.length}
            />
            {d.followUpNeeded.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {d.followUpNeeded.map(contact => (
                  <FollowUpRow key={contact.id} contact={contact} />
                ))}
              </div>
            ) : (
              <SubEmpty message="You're all caught up — no follow-ups overdue." />
            )}
          </div>
        )}

        {/* ── Footer timestamp ─────────────────────────────────────── */}
        {!loading && data?.generatedAt && (
          <p className="text-xs text-gray-400 text-center pb-2">
            Last updated{' '}
            {new Date(data.generatedAt).toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}

      </div>
    </div>
  )
}
