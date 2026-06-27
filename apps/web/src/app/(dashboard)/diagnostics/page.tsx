'use client'

import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

type Status = 'idle' | 'running' | 'ok' | 'warn' | 'error'

interface Check {
  id: string
  label: string
  description: string
  status: Status
  detail: string
  latencyMs?: number
  raw?: unknown
}

function Badge({ status }: { status: Status }) {
  const map: Record<Status, { bg: string; text: string; label: string }> = {
    idle:    { bg: 'bg-gray-100',   text: 'text-gray-500',  label: 'Not run' },
    running: { bg: 'bg-blue-100',   text: 'text-blue-600',  label: 'Checking…' },
    ok:      { bg: 'bg-green-100',  text: 'text-green-700', label: 'OK' },
    warn:    { bg: 'bg-amber-100',  text: 'text-amber-700', label: 'Warning' },
    error:   { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Error' },
  }
  const { bg, text, label } = map[status]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {status === 'running' && (
        <svg className="w-3 h-3 mr-1 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {label}
    </span>
  )
}

function CheckRow({ check }: { check: Check }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Badge status={check.status} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{check.label}</p>
            <p className="text-xs text-gray-400 truncate">{check.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {check.latencyMs !== undefined && (
            <span className="text-xs text-gray-400">{check.latencyMs}ms</span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <p className="text-xs text-gray-700 mb-2">{check.detail}</p>
          {check.raw !== undefined && (
            <pre className="text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-x-auto text-gray-800 max-h-48">
              {JSON.stringify(check.raw, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

export default function DiagnosticsPage() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user } = useUser()
  const session = useZuriSession()
  const token = session.data?.accessToken

  const [checks, setChecks] = useState<Check[]>([
    {
      id: 'clerk',
      label: 'Clerk Authentication',
      description: 'Is the user signed in via Clerk?',
      status: 'idle',
      detail: '',
    },
    {
      id: 'sync',
      label: 'Backend Sync (Clerk → Zuri JWT)',
      description: `Next.js /api/auth/clerk-sync → ${API_URL}/api/auth/clerk-sync`,
      status: 'idle',
      detail: '',
    },
    {
      id: 'health',
      label: 'API Health (DB + Redis)',
      description: `GET ${API_URL}/health`,
      status: 'idle',
      detail: '',
    },
    {
      id: 'authme',
      label: 'Authenticated API Call',
      description: `GET ${API_URL}/api/auth/me — requires JWT from sync`,
      status: 'idle',
      detail: '',
    },
    {
      id: 'contacts',
      label: 'Contacts API',
      description: `GET ${API_URL}/api/contacts — verifies DB data access`,
      status: 'idle',
      detail: '',
    },
  ])

  function setCheck(id: string, patch: Partial<Check>) {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  async function runChecks() {
    // Reset all
    setChecks((prev) => prev.map((c) => ({ ...c, status: 'running' as Status, detail: '', latencyMs: undefined, raw: undefined })))

    // 1. Clerk
    if (!authLoaded) {
      setCheck('clerk', { status: 'warn', detail: 'Clerk not yet loaded.' })
    } else if (!isSignedIn || !user) {
      setCheck('clerk', { status: 'error', detail: 'Not signed in. Go to /login.' })
    } else {
      setCheck('clerk', {
        status: 'ok',
        detail: `Signed in as ${user.emailAddresses[0]?.emailAddress}`,
        raw: { userId: user.id, email: user.emailAddresses[0]?.emailAddress, name: user.fullName },
      })
    }

    // 2. Backend sync
    const t2 = Date.now()
    try {
      const r = await fetch('/api/auth/clerk-sync', { method: 'POST' })
      const latencyMs = Date.now() - t2
      const body = await r.json().catch(() => null)
      if (r.ok && body?.token) {
        setCheck('sync', {
          status: 'ok',
          detail: `JWT received. Token starts with: ${body.token.slice(0, 20)}…`,
          latencyMs,
          raw: { status: r.status, tokenReceived: true, user: body.user },
        })
      } else {
        setCheck('sync', {
          status: 'error',
          detail: `HTTP ${r.status} — ${body?.error || 'No token in response'}. Check API_URL env var on Vercel and that the ECS API is running.`,
          latencyMs,
          raw: { status: r.status, body },
        })
      }
    } catch (err: any) {
      setCheck('sync', {
        status: 'error',
        detail: `Network error: ${err.message}. The Next.js route or the backend API is unreachable.`,
        latencyMs: Date.now() - t2,
        raw: { error: err.message },
      })
    }

    // 3. API health (direct from browser)
    const t3 = Date.now()
    try {
      const r = await fetch(`${API_URL}/health`)
      const latencyMs = Date.now() - t3
      const body = await r.json().catch(() => null)
      const dbOk = body?.services?.database === 'ok'
      const redisOk = body?.services?.redis === 'ok'
      const allOk = dbOk && redisOk
      setCheck('health', {
        status: allOk ? 'ok' : body ? 'warn' : 'error',
        detail: body
          ? `API ${body.status} | DB: ${body.services?.database} | Redis: ${body.services?.redis}`
          : `HTTP ${r.status} — no parseable response`,
        latencyMs,
        raw: body ?? { status: r.status },
      })
    } catch (err: any) {
      const latencyMs = Date.now() - t3
      const isCors = err.message?.includes('fetch') || err.message?.includes('network')
      setCheck('health', {
        status: 'error',
        detail: `${err.message}. ${isCors ? 'Could be CORS — check CORS_ORIGIN on ECS matches this Vercel URL.' : 'API server may be down.'}`,
        latencyMs,
        raw: { error: err.message },
      })
    }

    // 4. Authenticated call — /api/auth/me
    const currentToken = token
    if (!currentToken) {
      setCheck('authme', {
        status: 'warn',
        detail: 'No JWT available (sync step failed or still in progress). Fix the sync step first.',
      })
    } else {
      const t4 = Date.now()
      try {
        const r = await fetch(`${API_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        })
        const latencyMs = Date.now() - t4
        const body = await r.json().catch(() => null)
        setCheck('authme', {
          status: r.ok ? 'ok' : 'error',
          detail: r.ok
            ? `User confirmed: ${body?.user?.email}`
            : `HTTP ${r.status} — ${body?.error}`,
          latencyMs,
          raw: body,
        })
      } catch (err: any) {
        setCheck('authme', {
          status: 'error',
          detail: err.message,
          latencyMs: Date.now() - t4,
          raw: { error: err.message },
        })
      }
    }

    // 5. Contacts
    if (!currentToken) {
      setCheck('contacts', {
        status: 'warn',
        detail: 'No JWT available — fix the sync step first.',
      })
    } else {
      const t5 = Date.now()
      try {
        const r = await fetch(`${API_URL}/api/contacts`, {
          headers: { Authorization: `Bearer ${currentToken}` },
        })
        const latencyMs = Date.now() - t5
        const body = await r.json().catch(() => null)
        setCheck('contacts', {
          status: r.ok ? 'ok' : 'error',
          detail: r.ok
            ? `${body?.contacts?.length ?? 0} contact(s) returned`
            : `HTTP ${r.status} — ${body?.error}`,
          latencyMs,
          raw: r.ok ? { count: body?.contacts?.length, first: body?.contacts?.[0] } : body,
        })
      } catch (err: any) {
        setCheck('contacts', {
          status: 'error',
          detail: err.message,
          latencyMs: Date.now() - t5,
          raw: { error: err.message },
        })
      }
    }
  }

  // Auto-run on load once Clerk is ready
  useEffect(() => {
    if (authLoaded) runChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded])

  const overallStatus: Status = (() => {
    const statuses = checks.map((c) => c.status)
    if (statuses.some((s) => s === 'error')) return 'error'
    if (statuses.some((s) => s === 'warn' || s === 'running' || s === 'idle')) return 'warn'
    return 'ok'
  })()

  return (
    <div className="flex flex-col h-full">
      <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-gray-900">Diagnostics</h1>
          <Badge status={overallStatus} />
        </div>
        <button
          onClick={runChecks}
          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Re-run all
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Config snapshot */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Config Snapshot</p>
            <div className="space-y-1.5 text-sm font-mono">
              <div className="flex gap-3">
                <span className="text-gray-400 w-48 shrink-0">NEXT_PUBLIC_API_URL</span>
                <span className="text-gray-900 break-all">{API_URL}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-48 shrink-0">Clerk loaded</span>
                <span className="text-gray-900">{authLoaded ? 'yes' : 'no'}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-48 shrink-0">Clerk signed in</span>
                <span className="text-gray-900">{isSignedIn ? 'yes' : 'no'}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-48 shrink-0">Zuri JWT</span>
                <span className="text-gray-900">{token ? `${token.slice(0, 24)}…` : 'none'}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-48 shrink-0">syncFailed</span>
                <span className={session.data?.syncFailed ? 'text-red-600' : 'text-gray-900'}>
                  {String(session.data?.syncFailed ?? false)}
                </span>
              </div>
            </div>
          </div>

          {/* Checks */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Connection Checks</p>
            <div className="space-y-2">
              {checks.map((check) => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Links</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={`${API_URL}/health`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-600 hover:underline"
              >
                {API_URL}/health ↗
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
