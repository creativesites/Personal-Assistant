'use client'

import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'

interface AdminStats {
  users: { total: number; newToday: number; pro: number; business: number }
  sessions: { active: number; errors: number }
  messages: { today: number; total: number }
  queues: { depth: number; failed: number }
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
      <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">{label}</p>
      <p className={`text-3xl font-extrabold ${color ?? 'text-white'} tabular-nums`}>{value}</p>
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

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold text-white mb-1">System Overview</h1>
        <p className="text-gray-500 text-sm">Live operational status and system metrics</p>
      </div>

      {/* Stats grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-5 h-24 animate-pulse" />
          ))}
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total users" value={data.users.total.toLocaleString()} sub={`+${data.users.newToday} today`} />
            <StatCard label="Pro users" value={data.users.pro.toLocaleString()} sub={`${data.users.business} Business`} color="text-indigo-400" />
            <StatCard label="Active WA sessions" value={data.sessions.active.toLocaleString()} sub={data.sessions.errors > 0 ? `${data.sessions.errors} errors` : 'All healthy'} color="text-green-400" />
            <StatCard label="Session errors" value={data.sessions.errors.toLocaleString()} color={data.sessions.errors > 0 ? 'text-red-400' : 'text-gray-400'} />
            <StatCard label="Messages today" value={data.messages.today.toLocaleString()} sub="across all users" />
            <StatCard label="Messages total" value={data.messages.total.toLocaleString()} />
            <StatCard label="Queue depth" value={data.queues.depth.toLocaleString()} sub="jobs waiting" color={data.queues.depth > 100 ? 'text-yellow-400' : 'text-white'} />
            <StatCard label="Failed jobs" value={data.queues.failed.toLocaleString()} color={data.queues.failed > 0 ? 'text-red-400' : 'text-gray-400'} />
          </div>
        </>
      )}

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
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
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
