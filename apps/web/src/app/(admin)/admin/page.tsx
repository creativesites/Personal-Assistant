'use client'

import { useState, useEffect } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'

interface AdminStats {
  users: { total: number; newToday: number; pro: number; business: number }
  sessions: { active: number; errors: number }
  messages: { today: number; total: number }
  queues: { depth: number; failed: number }
}

interface FailedJob {
  id: string
  queueName: string
  failedReason: string
  timestamp: number
  attemptsMade: number
  data: any
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-2">{label}</p>
      <p className={`text-2xl md:text-3xl font-extrabold ${color ?? 'text-white'} tabular-nums`}>{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

const SERVICES = [
  { name: 'API Server', port: 3000, description: 'Fastify REST + WebSocket' },
  { name: 'WhatsApp Service', port: 3001, description: 'whatsapp-web.js sessions' },
  { name: 'Intelligence Service', port: 8000, description: 'Python AI engines' },
  { name: 'Redis', port: 6379, description: 'Queue + pub/sub' },
  { name: 'PostgreSQL', port: 5432, description: 'Primary database' },
]

export default function AdminOverviewPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  const { data, loading } = useApi<AdminStats>('/api/admin/stats', token)

  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([])
  const [dlqLoading, setDlqLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const fetchDlq = async () => {
    if (!token) return
    setDlqLoading(true)
    try {
      const res = await fetch('/api/admin/queues/failed', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (json.ok) setFailedJobs(json.failedJobs || [])
    } catch {
      // ignore
    } finally {
      setDlqLoading(false)
    }
  }

  useEffect(() => {
    fetchDlq()
  }, [token])

  const handleRetryAll = async () => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/queues/retry-failed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ all: true }),
      })
      const json = await res.json()
      setActionMsg(`Retried ${json.retriedCount || 0} failed jobs`)
      fetchDlq()
    } catch {
      setActionMsg('Failed to retry jobs')
    }
  }

  const handleClearAll = async () => {
    if (!token) return
    try {
      const res = await fetch('/api/admin/queues/failed', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      setActionMsg(`Cleared ${json.clearedCount || 0} failed jobs`)
      fetchDlq()
    } catch {
      setActionMsg('Failed to clear jobs')
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-extrabold text-white mb-1">System Overview</h1>
        <p className="text-gray-500 text-sm">Live operational status and system metrics</p>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total users" value={data.users.total.toLocaleString()} sub={`+${data.users.newToday} today`} />
          <StatCard label="Pro users" value={data.users.pro.toLocaleString()} sub={`${data.users.business} Business`} color="text-indigo-400" />
          <StatCard label="Active WA sessions" value={data.sessions.active.toLocaleString()} sub={data.sessions.errors > 0 ? `${data.sessions.errors} errors` : 'All healthy'} color="text-green-400" />
          <StatCard label="Session errors" value={data.sessions.errors.toLocaleString()} color={data.sessions.errors > 0 ? 'text-red-400' : 'text-gray-400'} />
          <StatCard label="Messages today" value={data.messages.today.toLocaleString()} sub="across all users" />
          <StatCard label="Messages total" value={data.messages.total.toLocaleString()} />
          <StatCard label="Queue depth" value={data.queues.depth.toLocaleString()} sub="jobs waiting" color={data.queues.depth > 100 ? 'text-yellow-400' : 'text-white'} />
          <StatCard label="Failed jobs" value={data.queues.failed.toLocaleString()} color={data.queues.failed > 0 ? 'text-red-400' : 'text-gray-400'} />
        </div>
      )}

      {/* DLQ Inspector Card */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🚨</span>
            <h2 className="text-white font-semibold text-sm">Dead-Letter Queue (DLQ) & Failed Jobs</h2>
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full font-mono">
              {failedJobs.length} failed
            </span>
          </div>
          <div className="flex items-center gap-2">
            {actionMsg && <span className="text-xs text-emerald-400 font-medium">{actionMsg}</span>}
            <button
              onClick={handleRetryAll}
              disabled={failedJobs.length === 0}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-all"
            >
              🔄 Retry All Failed
            </button>
            <button
              onClick={handleClearAll}
              disabled={failedJobs.length === 0}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 rounded-lg text-xs font-semibold transition-all"
            >
              🗑️ Clear DLQ
            </button>
          </div>
        </div>

        {dlqLoading ? (
          <div className="p-6 text-center text-xs text-gray-500">Checking dead-letter queues...</div>
        ) : failedJobs.length === 0 ? (
          <div className="p-6 text-center text-xs text-gray-500">
            ✅ No failed queue jobs in Dead-Letter Queue. All pipeline message jobs processing normally.
          </div>
        ) : (
          <div className="divide-y divide-gray-800 max-h-64 overflow-y-auto font-mono text-xs">
            {failedJobs.map((job, idx) => (
              <div key={job.id || idx} className="p-3.5 flex items-center justify-between text-gray-300 hover:bg-gray-800/40">
                <div className="space-y-0.5 min-w-0 flex-1 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold">{job.queueName}</span>
                    <span className="text-gray-500 text-[10px]">ID: {job.id}</span>
                  </div>
                  <p className="text-red-400 text-[11px] truncate">{job.failedReason}</p>
                </div>
                <div className="text-right text-[10px] text-gray-500 flex-shrink-0">
                  {new Date(job.timestamp).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Service health */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Service health</h2>
          <span className="text-xs text-gray-500">Static configuration — check server directly for live status</span>
        </div>
        <div className="divide-y divide-gray-800">
          {SERVICES.map((service) => (
            <div key={service.name} className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <div>
                  <p className="text-white text-sm font-medium">{service.name}</p>
                  <p className="text-gray-500 text-xs">{service.description}</p>
                </div>
              </div>
              <span className="text-xs text-gray-600 font-mono">:{service.port}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'View users', href: '/admin/users', icon: '👥' },
          { label: 'WA sessions', href: '/admin/sessions', icon: '📱' },
          { label: 'Feature flags', href: '/admin/features', icon: '🚩' },
          { label: 'Billing', href: '/admin/billing', icon: '💳' },
        ].map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 bg-gray-900 rounded-xl border border-gray-800 px-4 py-3.5 hover:border-indigo-700 hover:bg-gray-800/60 transition-colors"
          >
            <span className="text-xl">{link.icon}</span>
            <span className="text-gray-300 text-sm font-medium">{link.label}</span>
          </a>
        ))}
      </div>
    </div>
  )
}
