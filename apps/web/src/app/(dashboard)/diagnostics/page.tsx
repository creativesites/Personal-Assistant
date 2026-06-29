'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth, useUser } from '@clerk/nextjs'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { Badge, PageHeader } from '@/components/ui'

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

const STATUS_CONFIG: Record<Status, { bg: string; text: string; label: string; variant: 'default' | 'success' | 'warning' | 'error' | 'info' }> = {
  idle:    { bg: 'bg-gray-100',   text: 'text-gray-500',  label: 'Not run',   variant: 'default' },
  running: { bg: 'bg-blue-100',   text: 'text-blue-600',  label: 'Checking…', variant: 'info' },
  ok:      { bg: 'bg-green-100',  text: 'text-green-700', label: 'OK',        variant: 'success' },
  warn:    { bg: 'bg-amber-100',  text: 'text-amber-700', label: 'Warning',   variant: 'warning' },
  error:   { bg: 'bg-red-100',    text: 'text-red-700',   label: 'Error',     variant: 'error' },
}

function StatusBadge({ status }: { status: Status }) {
  const { variant, label } = STATUS_CONFIG[status]
  return (
    <Badge variant={variant} className="inline-flex items-center gap-1">
      {status === 'running' && (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {label}
    </Badge>
  )
}

function CheckRow({ check }: { check: Check }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={check.status} />
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{check.label}</p>
            <p className="text-xs text-gray-400 truncate">{check.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {check.latencyMs !== undefined && (
            <span className="text-xs text-gray-400 tabular-nums">{check.latencyMs}ms</span>
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
          <p className="text-xs text-gray-700 mb-2 leading-relaxed">{check.detail}</p>
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

interface ServerConfig {
  INTERNAL_API_SECRET: { set: boolean; length: number; masked: string }
  API_URL: { value: string; note: string }
  NEXT_PUBLIC_API_URL: { value: string; note: string }
  match: boolean | null
}

interface SyncProgress {
  conversations: { done: number; total: number }
  messages: { done: number; total: number }
  percent: number
}

interface SyncStatus {
  id?: string
  status: 'never_run' | 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress?: SyncProgress
  stats?: { contactsCreated: number; leadsGenerated: number; insightsExtracted: number }
  currentChatName?: string | null
  errorMessage?: string | null
  startedAt?: string | null
  completedAt?: string | null
}

export default function DiagnosticsPage() {
  const { isSignedIn, isLoaded: authLoaded } = useAuth()
  const { user } = useUser()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [serverConfig, setServerConfig] = useState<ServerConfig | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [lastRun, setLastRun] = useState<Date | null>(null)
  const isRunning = useRef(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const syncPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchSyncStatus = useCallback(async (currentToken?: string) => {
    const t = currentToken || token
    if (!t) return
    try {
      const r = await fetch(`${API_URL}/api/admin/history-sync/status`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (r.ok) setSyncStatus(await r.json())
    } catch { /* ignore */ }
  }, [token])

  // Poll sync status while running
  useEffect(() => {
    if (syncStatus?.status === 'running') {
      syncPollRef.current = setInterval(() => fetchSyncStatus(), 2000)
    } else if (syncPollRef.current) {
      clearInterval(syncPollRef.current)
      syncPollRef.current = null
    }
    return () => {
      if (syncPollRef.current) clearInterval(syncPollRef.current)
    }
  }, [syncStatus?.status, fetchSyncStatus])

  useEffect(() => {
    if (token) fetchSyncStatus()
  }, [token, fetchSyncStatus])

  async function startSync() {
    if (!token || syncLoading) return
    setSyncLoading(true)
    try {
      const r = await fetch(`${API_URL}/api/admin/history-sync/start`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.ok) await fetchSyncStatus()
    } catch { /* ignore */ }
    setSyncLoading(false)
  }

  async function cancelSync() {
    if (!token || syncLoading) return
    setSyncLoading(true)
    try {
      await fetch(`${API_URL}/api/admin/history-sync/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      await fetchSyncStatus()
    } catch { /* ignore */ }
    setSyncLoading(false)
  }

  useEffect(() => {
    fetch('/api/diagnostics/config')
      .then(r => r.json())
      .then(setServerConfig)
      .catch(() => {})
  }, [])

  const [checks, setChecks] = useState<Check[]>([
    { id: 'clerk',      label: 'Clerk Authentication',           description: 'Is the user signed in via Clerk?',                              status: 'idle', detail: '' },
    { id: 'sync',       label: 'Backend Sync (Clerk → Zuri JWT)', description: `Next.js /api/auth/clerk-sync → ${API_URL}/api/auth/clerk-sync`, status: 'idle', detail: '' },
    { id: 'health',     label: 'API Health (DB + Redis)',          description: `Proxied server-side → ${API_URL}/health`,                      status: 'idle', detail: '' },
    { id: 'authme',     label: 'Authenticated API Call',           description: `GET ${API_URL}/api/auth/me — requires JWT from sync`,          status: 'idle', detail: '' },
    { id: 'contacts',   label: 'Contacts API',                    description: `GET ${API_URL}/api/contacts — verifies DB data access`,         status: 'idle', detail: '' },
    { id: 'wa_service', label: 'WhatsApp Service Health',          description: 'Internal whatsapp service — DB, Redis, Chromium',              status: 'idle', detail: '' },
    { id: 'wa_instance',label: 'WhatsApp Instance Status',         description: 'Your WhatsApp connection state from the database',             status: 'idle', detail: '' },
  ])

  function setCheck(id: string, patch: Partial<Check>) {
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const runChecks = useCallback(async () => {
    if (isRunning.current) return
    isRunning.current = true
    setChecks(prev => prev.map(c => ({ ...c, status: 'running' as Status, detail: '', latencyMs: undefined, raw: undefined })))

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
    let freshToken: string | null = null
    const t2 = Date.now()
    try {
      const r = await fetch('/api/auth/clerk-sync', { method: 'POST' })
      const latencyMs = Date.now() - t2
      const body = await r.json().catch(() => null)
      if (r.ok && body?.token) {
        freshToken = body.token
        setCheck('sync', {
          status: 'ok',
          detail: `JWT received. Token starts with: ${body.token.slice(0, 20)}…`,
          latencyMs,
          raw: { status: r.status, tokenReceived: true, user: body.user },
        })
      } else {
        const hint = r.status === 401 || r.status === 403
          ? `HTTP ${r.status} — INTERNAL_API_SECRET mismatch. The value in /opt/zuri/.env on ECS must match INTERNAL_API_SECRET on Vercel.`
          : r.status === 404
          ? 'HTTP 404 — /api/auth/clerk-sync route not found. Redeploy the API.'
          : `HTTP ${r.status} — ${body?.error || 'No token in response'}${body?.detail ? `: ${body.detail}` : ''}`
        setCheck('sync', { status: 'error', detail: hint, latencyMs, raw: { status: r.status, body } })
      }
    } catch (err: any) {
      setCheck('sync', { status: 'error', detail: `Network error: ${err.message}`, latencyMs: Date.now() - t2, raw: { error: err.message } })
    }

    // 3. API health
    const t3 = Date.now()
    try {
      const r = await fetch('/api/diagnostics/health')
      const latencyMs = Date.now() - t3
      const payload = await r.json().catch(() => null)
      if (!payload?.reachable) {
        setCheck('health', { status: 'error', detail: `API unreachable: ${payload?.error || 'unknown'}. Check Docker on ECS.`, latencyMs, raw: payload })
      } else {
        const body = payload.body
        setCheck('health', {
          status: body?.services?.database === 'ok' && body?.services?.redis === 'ok' ? 'ok' : 'warn',
          detail: `API ${body?.status ?? '?'} | DB: ${body?.services?.database ?? '?'} | Redis: ${body?.services?.redis ?? '?'}`,
          latencyMs,
          raw: body,
        })
      }
    } catch (err: any) {
      setCheck('health', { status: 'error', detail: err.message, latencyMs: Date.now() - t3 })
    }

    const currentToken = freshToken || token

    // 4. Auth me
    if (!currentToken) {
      setCheck('authme', { status: 'warn', detail: 'No JWT available — fix the sync step first.' })
    } else {
      const t4 = Date.now()
      try {
        const r = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${currentToken}` } })
        const latencyMs = Date.now() - t4
        const body = await r.json().catch(() => null)
        setCheck('authme', { status: r.ok ? 'ok' : 'error', detail: r.ok ? `User confirmed: ${body?.user?.email}` : `HTTP ${r.status} — ${body?.error}`, latencyMs, raw: body })
      } catch (err: any) {
        setCheck('authme', { status: 'error', detail: err.message, latencyMs: Date.now() - t3 })
      }
    }

    // 5. Contacts
    if (!currentToken) {
      setCheck('contacts', { status: 'warn', detail: 'No JWT available — fix the sync step first.' })
    } else {
      const t5 = Date.now()
      try {
        const r = await fetch(`${API_URL}/api/contacts`, { headers: { Authorization: `Bearer ${currentToken}` } })
        const latencyMs = Date.now() - t5
        const body = await r.json().catch(() => null)
        setCheck('contacts', { status: r.ok ? 'ok' : 'error', detail: r.ok ? `${body?.contacts?.length ?? 0} contact(s) returned` : `HTTP ${r.status} — ${body?.error}`, latencyMs, raw: r.ok ? { count: body?.contacts?.length } : body })
      } catch (err: any) {
        setCheck('contacts', { status: 'error', detail: err.message, latencyMs: Date.now() - t3 })
      }
    }

    // 6. WhatsApp service
    if (!currentToken) {
      setCheck('wa_service', { status: 'warn', detail: 'No JWT available — fix the sync step first.' })
    } else {
      const t6 = Date.now()
      try {
        const r = await fetch(`${API_URL}/api/whatsapp/service-health`, { headers: { Authorization: `Bearer ${currentToken}` } })
        const latencyMs = Date.now() - t6
        const body = await r.json().catch(() => null)
        const up = body?.reachable === true
        setCheck('wa_service', {
          status: up ? (body?.status === 'ok' ? 'ok' : 'warn') : 'error',
          detail: up ? `Service up | DB: ${body?.services?.database ?? '?'} | Redis: ${body?.services?.redis ?? '?'}` : `Service unreachable: ${body?.error || `HTTP ${r.status}`}`,
          latencyMs, raw: body,
        })
      } catch (err: any) {
        setCheck('wa_service', { status: 'error', detail: err.message, latencyMs: Date.now() - t3 })
      }
    }

    // 7. WA instance
    if (!currentToken) {
      setCheck('wa_instance', { status: 'warn', detail: 'No JWT available — fix the sync step first.' })
    } else {
      const t7 = Date.now()
      try {
        const r = await fetch(`${API_URL}/api/whatsapp/status`, { headers: { Authorization: `Bearer ${currentToken}` } })
        const latencyMs = Date.now() - t7
        const body = await r.json().catch(() => null) as Record<string, unknown> | null
        let waStatus: Status = 'ok'
        let detail = ''
        if (!r.ok) { waStatus = 'error'; detail = `HTTP ${r.status} — ${(body as any)?.error || 'Unknown'}` }
        else if (body?.status === 'connected') { waStatus = 'ok'; detail = `Connected${body.phone ? ` as +${body.phone}` : ''}` }
        else if (body?.status === 'qr_pending') { waStatus = 'warn'; detail = 'QR pending — go to /onboarding to scan' }
        else if (body?.status === 'link_code_pending') { waStatus = 'warn'; detail = 'Link-code pending — go to /onboarding to enter the code' }
        else if (body?.status === 'error') { waStatus = 'error'; detail = 'Chromium/Puppeteer failed to launch. Check server logs.' }
        else if (body?.status === 'connecting') { waStatus = 'warn'; detail = 'Connection in progress — wait and re-run' }
        else { waStatus = 'warn'; detail = `Status: ${body?.status || 'unknown'} — not connected. Go to /onboarding.` }
        setCheck('wa_instance', { status: waStatus, detail, latencyMs, raw: body })
      } catch (err: any) {
        setCheck('wa_instance', { status: 'error', detail: err.message, latencyMs: Date.now() - t3 })
      }
    }

    setLastRun(new Date())
    isRunning.current = false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoaded, isSignedIn, user, token])

  useEffect(() => {
    if (authLoaded) runChecks()
  }, [authLoaded, runChecks])

  useEffect(() => {
    if (!autoRefresh || !authLoaded) return
    const id = setInterval(() => runChecks(), 30_000)
    return () => clearInterval(id)
  }, [autoRefresh, authLoaded, runChecks])

  const overallStatus: Status = (() => {
    const statuses = checks.map(c => c.status)
    if (statuses.some(s => s === 'error'))   return 'error'
    if (statuses.some(s => s === 'warn' || s === 'running' || s === 'idle')) return 'warn'
    return 'ok'
  })()

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Diagnostics"
        action={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {lastRun && (
              <span className="text-xs text-gray-400 tabular-nums">
                Last run {lastRun.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <span className="text-xs text-gray-500">Auto-refresh</span>
              <button
                role="switch"
                aria-checked={autoRefresh}
                onClick={() => setAutoRefresh(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoRefresh ? 'bg-indigo-600' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${autoRefresh ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <StatusBadge status={overallStatus} />
            <button
              onClick={() => runChecks()}
              className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
            >
              Re-run all
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Config snapshot */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Config Snapshot</p>
            <div className="space-y-2 text-xs font-mono">
              <p className="text-gray-400 uppercase text-[10px] tracking-wider pt-1">— Client (browser)</p>
              <div className="flex gap-3">
                <span className="text-gray-400 w-44 shrink-0">NEXT_PUBLIC_API_URL</span>
                <span className="text-gray-900 break-all">{API_URL}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-44 shrink-0">Clerk signed in</span>
                <span className="text-gray-900">{isSignedIn ? 'yes' : 'no'}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-44 shrink-0">Zuri JWT</span>
                <span className="text-gray-900">{token ? `${token.slice(0, 20)}…` : 'none'}</span>
              </div>
              <div className="flex gap-3">
                <span className="text-gray-400 w-44 shrink-0">syncFailed</span>
                <span className={session.data?.syncFailed ? 'text-red-600 font-bold' : 'text-gray-900'}>
                  {String(session.data?.syncFailed ?? false)}
                </span>
              </div>

              <p className="text-gray-400 uppercase text-[10px] tracking-wider pt-2">— Server (Vercel env)</p>
              {serverConfig ? (
                <>
                  <div className="flex gap-3">
                    <span className="text-gray-400 w-44 shrink-0">API_URL</span>
                    <span className="text-gray-900 break-all">{serverConfig.API_URL.value}</span>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-gray-400 w-44 shrink-0">INTERNAL_API_SECRET</span>
                    <span className={`break-all ${serverConfig.INTERNAL_API_SECRET.set ? 'text-gray-900' : 'text-red-600'}`}>
                      {serverConfig.INTERNAL_API_SECRET.masked}
                      {serverConfig.INTERNAL_API_SECRET.set && (
                        <span className="text-gray-400 ml-1">({serverConfig.INTERNAL_API_SECRET.length} chars)</span>
                      )}
                    </span>
                  </div>
                  {serverConfig.match === false && (
                    <p className="text-amber-600">⚠ API_URL and NEXT_PUBLIC_API_URL differ</p>
                  )}
                </>
              ) : (
                <span className="text-gray-400">Loading…</span>
              )}
            </div>
          </div>

          {/* Auth checks */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Auth</p>
            <div className="space-y-2">
              {checks.filter(c => ['clerk', 'sync', 'authme'].includes(c.id)).map(check => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </div>

          {/* Service checks */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Services</p>
            <div className="space-y-2">
              {checks.filter(c => ['health', 'wa_service', 'wa_instance'].includes(c.id)).map(check => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </div>

          {/* Data checks */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Data</p>
            <div className="space-y-2">
              {checks.filter(c => ['contacts'].includes(c.id)).map(check => (
                <CheckRow key={check.id} check={check} />
              ))}
            </div>
          </div>

          {/* Historical Intelligence Sync */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Historical Intelligence Sync</p>
            <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">Analyse conversation history</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Re-processes all stored messages through Zuri&apos;s AI to build contact profiles, lead scores, insights, and calendar events from day one.
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {syncStatus?.status === 'running' ? (
                    <button
                      onClick={cancelSync}
                      disabled={syncLoading}
                      className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={startSync}
                      disabled={syncLoading || !token}
                      className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 font-medium"
                    >
                      {syncStatus?.status === 'completed' || syncStatus?.status === 'cancelled' || syncStatus?.status === 'failed'
                        ? 'Re-run sync'
                        : 'Run historical sync'}
                    </button>
                  )}
                </div>
              </div>

              {syncStatus && syncStatus.status !== 'never_run' && (
                <div className="space-y-3">
                  {/* Status badge */}
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                      syncStatus.status === 'running'   ? 'bg-blue-100 text-blue-700' :
                      syncStatus.status === 'completed' ? 'bg-green-100 text-green-700' :
                      syncStatus.status === 'failed'    ? 'bg-red-100 text-red-700' :
                      syncStatus.status === 'cancelled' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {syncStatus.status === 'running' && (
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      )}
                      {{
                        running: 'Analysing…',
                        completed: 'Complete',
                        failed: 'Failed',
                        cancelled: 'Cancelled',
                        pending: 'Queued',
                      }[syncStatus.status] ?? syncStatus.status}
                    </span>
                    {syncStatus.currentChatName && syncStatus.status === 'running' && (
                      <span className="text-xs text-gray-400 truncate">— {syncStatus.currentChatName}</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  {syncStatus.progress && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>Conversations: {syncStatus.progress.conversations.done} / {syncStatus.progress.conversations.total}</span>
                        <span className="font-medium tabular-nums">{syncStatus.progress.percent}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${syncStatus.progress.percent}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 tabular-nums">
                        {syncStatus.progress.messages.done.toLocaleString()} / {syncStatus.progress.messages.total.toLocaleString()} messages queued
                      </p>
                    </div>
                  )}

                  {/* Stats */}
                  {syncStatus.stats && (syncStatus.stats.contactsCreated + syncStatus.stats.leadsGenerated + syncStatus.stats.insightsExtracted) > 0 && (
                    <div className="grid grid-cols-3 gap-3 pt-1">
                      {[
                        { label: 'Contacts', val: syncStatus.stats.contactsCreated },
                        { label: 'Leads', val: syncStatus.stats.leadsGenerated },
                        { label: 'Insights', val: syncStatus.stats.insightsExtracted },
                      ].map(({ label, val }) => (
                        <div key={label} className="bg-gray-50 rounded-lg px-3 py-2 text-center">
                          <p className="text-base font-semibold text-gray-900 tabular-nums">{val.toLocaleString()}</p>
                          <p className="text-xs text-gray-500">{label}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {syncStatus.errorMessage && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{syncStatus.errorMessage}</p>
                  )}

                  {syncStatus.completedAt && (
                    <p className="text-xs text-gray-400">
                      Finished {new Date(syncStatus.completedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {!token && (
                <p className="text-xs text-amber-600">Sign in and sync your JWT first to run the historical sync.</p>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Quick Links</p>
            <div className="flex flex-wrap gap-3">
              <a href={`${API_URL}/health`} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline">
                {API_URL}/health ↗
              </a>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
