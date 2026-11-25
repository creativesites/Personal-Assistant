'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Bell, CalendarDays, Check, CheckCircle2, Clock, HelpCircle, Loader2, Pencil,
  Send, Handshake, X, ChevronRight,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { ZuriMark } from '@/components/ui/zuri-mark'

interface NowData {
  autoReply: {
    onForChat: boolean
    active: boolean
    blockedBy: string | null
    blockedReason: string | null
    inclusionMode: boolean
    delayRange: { minSeconds: number; maxSeconds: number } | null
  }
  scheduled: { id: string; text: string; sendAt: string | null; messageId: string; replyingTo: string | null }[]
  suggestions: { id: string; text: string; tone: string | null; messageId: string }[]
  openLoops: {
    questions: { key: string; text: string; at: string; messageId: string }[]
    promises: { key: string; text: string; at: string; messageId: string }[]
    dates: { key: string; title: string; date: string | null; at: string; messageId: string }[]
  }
  lastViewedAt: string | null
}

interface CatchUp { digest: string[]; read: string | null; newCount: number }

function useNow(tickMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), tickMs)
    return () => clearInterval(t)
  }, [tickMs])
  return now
}

function countdown(sendAt: string | null, now: number): string {
  if (!sendAt) return 'soon'
  const s = Math.round((new Date(sendAt).getTime() - now) / 1000)
  if (s <= 0) return 'any moment'
  if (s < 60) return `in ${s}s`
  return `in ${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

function minutes(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)} min`
}

function shortDate(d: string): string {
  const date = new Date(d + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff > 1 && diff < 7) return date.toLocaleDateString([], { weekday: 'long' })
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function Section({ title, icon, children, right }: { title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
          {icon}{title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function NowTab({
  conversationId,
  contactId,
  contactName,
  isGroup,
  token,
  refreshKey,
  onUseDraft,
  onFocusComposer,
  onSendSuggestion,
}: {
  conversationId: string
  contactId: string | null
  contactName: string
  isGroup: boolean
  token: string | null
  /** Changes whenever the chat gets a new message — refetches. */
  refreshKey: string | number
  onUseDraft: (text: string) => void
  onFocusComposer: () => void
  onSendSuggestion: (suggestionId: string) => Promise<void> | void
}) {
  const { addToast } = useToast()
  const [data, setData] = useState<NowData | null>(null)
  const [error, setError] = useState(false)
  const [catchUp, setCatchUp] = useState<CatchUp | null>(null)
  const [catchUpLoading, setCatchUpLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const now = useNow(1000)
  const firstName = contactName.split(' ')[0]

  const load = useCallback(async () => {
    if (!token) return
    try {
      const d = await apiClient<NowData>(`/api/conversations/${conversationId}/zuri/now`, { token })
      setData(d)
      setError(false)
      return d
    } catch {
      setError(true)
    }
  }, [conversationId, token])

  // First load: fetch Now, then the catch-up since your last visit, then mark viewed.
  useEffect(() => {
    let cancelled = false
    setData(null); setCatchUp(null); setEditing(null)
    ;(async () => {
      const d = await load()
      if (cancelled || !d || !token) return
      setCatchUpLoading(true)
      try {
        const q = d.lastViewedAt ? `?since=${encodeURIComponent(d.lastViewedAt)}` : ''
        const c = await apiClient<CatchUp>(`/api/conversations/${conversationId}/zuri/catch-up${q}`, { token })
        if (!cancelled) setCatchUp(c)
      } catch { /* the card just stays hidden */ }
      finally { if (!cancelled) setCatchUpLoading(false) }
      apiClient(`/api/conversations/${conversationId}/zuri/viewed`, { method: 'POST', token }).catch(() => {})
    })()
    return () => { cancelled = true }
  }, [conversationId, token, load])

  // New messages: refresh Now (cheap); the catch-up stays as first shown.
  useEffect(() => { if (data) load() }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // A scheduled reply passing its send time: refresh shortly after so it drops off.
  useEffect(() => {
    const due = data?.scheduled.find(s => s.sendAt && new Date(s.sendAt).getTime() - now < -5000)
    if (due) load()
  }, [now]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try {
      await fn()
      if (ok) addToast({ variant: 'success', title: ok })
      await load()
    } catch (err) {
      addToast({ variant: 'error', title: (err as { data?: { error?: string } })?.data?.error || 'Something went wrong' })
    } finally {
      setBusy(null)
    }
  }

  const toggleAutoReply = (enabled: boolean) => act('auto', () =>
    apiClient(`/api/conversations/${conversationId}/zuri/auto-reply`, { method: 'POST', token: token!, body: JSON.stringify({ enabled }) }),
    enabled ? `Auto-reply on for ${firstName}` : `Auto-reply off for ${firstName}`)

  const resolveLoop = (key: string) => act(key, () =>
    apiClient(`/api/conversations/${conversationId}/zuri/loops/resolve`, { method: 'POST', token: token!, body: JSON.stringify({ loopKey: key }) }))

  const remind = (key: string, title: string, dueDate: string | null) => act(`r-${key}`, async () => {
    if (!contactId) throw new Error('No contact')
    await apiClient(`/api/contacts/${contactId}/tasks`, {
      method: 'POST', token: token!,
      body: JSON.stringify({ title, dueDate: dueDate ?? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) }),
    })
  }, 'Reminder added')

  if (error && !data) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        Couldn&apos;t load this chat&apos;s details.
        <button onClick={() => load()} className="mt-2 block w-full text-xs font-semibold text-indigo-600">Try again</button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map(i => <div key={i} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)}
      </div>
    )
  }

  const { autoReply, scheduled, suggestions, openLoops } = data
  const loopCount = openLoops.questions.length + openLoops.promises.length + openLoops.dates.length

  return (
    <div className="divide-y divide-gray-100 pb-6">
      {/* ── Catch-up ── */}
      {(catchUpLoading || catchUp?.read || (catchUp?.digest.length ?? 0) > 0) && (
        <div className="px-4 py-3">
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-3 ring-1 ring-indigo-100">
            <div className="mb-1.5 flex items-center gap-1.5">
              <ZuriMark size={16} />
              <p className="text-[11px] font-bold text-indigo-700">
                {catchUp && catchUp.newCount > 0 && data.lastViewedAt ? `Since you last looked · ${catchUp.newCount} new` : 'Where things stand'}
              </p>
            </div>
            {catchUpLoading && !catchUp ? (
              <div className="space-y-1.5">
                <div className="h-3 w-full animate-pulse rounded bg-indigo-100/70" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-indigo-100/70" />
              </div>
            ) : (
              <>
                {catchUp!.digest.length > 0 && (
                  <ul className="mb-1.5 space-y-1">
                    {catchUp!.digest.map((d, i) => (
                      <li key={i} className="flex gap-1.5 text-[13px] leading-snug text-gray-800">
                        <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-indigo-400" />{d}
                      </li>
                    ))}
                  </ul>
                )}
                {catchUp!.read && <p className="text-[13px] leading-snug text-gray-600">{catchUp!.read}</p>}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Auto-reply ── */}
      <Section
        title="Auto-reply"
        icon={<ZuriMark size={13} />}
        right={!isGroup && (
          <button
            role="switch"
            aria-checked={autoReply.onForChat}
            disabled={busy === 'auto'}
            onClick={() => toggleAutoReply(!autoReply.onForChat)}
            className={`relative h-6 w-11 rounded-full transition-colors ${autoReply.onForChat ? 'bg-emerald-500' : 'bg-gray-300'} disabled:opacity-50`}
            title={autoReply.onForChat ? `Stop auto-replying to ${firstName}` : `Auto-reply to ${firstName}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${autoReply.onForChat ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
          </button>
        )}
      >
        {autoReply.active ? (
          <p className="text-xs text-gray-600">
            Zuri answers {firstName} for you
            {autoReply.delayRange && autoReply.delayRange.maxSeconds > 0 && (
              <> after {minutes(autoReply.delayRange.minSeconds)}–{minutes(autoReply.delayRange.maxSeconds)}</>
            )}. Replying yourself cancels it.
          </p>
        ) : (
          <p className="text-xs text-gray-500">
            {autoReply.blockedReason ?? 'Off'}
            {(autoReply.blockedBy === 'disabled' || autoReply.blockedBy === 'review_mode') && (
              <a href="/settings?tab=auto_responses" className="ml-1 font-semibold text-indigo-600">Settings</a>
            )}
          </p>
        )}

        {scheduled.map(s => (
          <div key={s.id} className="mt-2.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-emerald-700">
              <Clock size={12} className="animate-pulse" /> Sending {countdown(s.sendAt, now)}
            </p>
            {editing?.id === s.id ? (
              <textarea
                autoFocus
                value={editing.text}
                onChange={e => setEditing({ id: s.id, text: e.target.value })}
                rows={3}
                className="w-full resize-none rounded-xl border border-emerald-200 bg-white p-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
              />
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-snug text-gray-800">{s.text}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {editing?.id === s.id ? (
                <>
                  <button
                    disabled={busy === s.id || !editing.text.trim()}
                    onClick={() => act(s.id, () => apiClient(`/api/zuri/scheduled/${s.id}`, { method: 'PATCH', token: token!, body: JSON.stringify({ text: editing.text }) }), 'Reply updated').then(() => setEditing(null))}
                    className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    <Check size={13} /> Save
                  </button>
                  <button onClick={() => setEditing(null)} className="min-h-8 rounded-xl px-3 text-xs font-semibold text-gray-600 hover:bg-white">Cancel</button>
                </>
              ) : (
                <>
                  <button
                    disabled={busy === s.id}
                    onClick={() => act(s.id, () => apiClient(`/api/zuri/scheduled/${s.id}/send-now`, { method: 'POST', token: token! }), 'Sending now')}
                    className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send now
                  </button>
                  <button onClick={() => setEditing({ id: s.id, text: s.text })} className="inline-flex min-h-8 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-gray-700 hover:bg-white">
                    <Pencil size={12} /> Edit
                  </button>
                  <button
                    disabled={busy === s.id}
                    onClick={() => act(s.id, () => apiClient(`/api/zuri/scheduled/${s.id}/cancel`, { method: 'POST', token: token! }), "Won't send")}
                    className="inline-flex min-h-8 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-rose-600 hover:bg-white"
                  >
                    <X size={13} /> Don&apos;t send
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </Section>

      {/* ── Suggested replies ── */}
      {suggestions.length > 0 && scheduled.length === 0 && (
        <Section title="Suggested replies" icon={<Send size={11} />}>
          <div className="space-y-2">
            {suggestions.map(s => (
              <div key={s.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm shadow-gray-100">
                {s.tone && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{s.tone}</p>}
                <p className="whitespace-pre-wrap text-[13px] leading-snug text-gray-800">{s.text}</p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    disabled={busy === s.id}
                    onClick={() => act(s.id, async () => { await onSendSuggestion(s.id) }, 'Sent')}
                    className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send
                  </button>
                  <button onClick={() => onUseDraft(s.text)} className="inline-flex min-h-8 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-gray-700 hover:bg-gray-100">
                    <Pencil size={12} /> Edit first
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Open loops ── */}
      <Section title="Open loops" icon={<CheckCircle2 size={11} />}>
        {loopCount === 0 ? (
          <p className="text-xs text-gray-400">Nothing outstanding with {firstName}.</p>
        ) : (
          <ul className="space-y-1">
            {openLoops.questions.map(q => (
              <LoopRow key={q.key} icon={<HelpCircle size={13} />} tone="rose" label={`${firstName} asked`} text={q.text}
                busy={busy === q.key} onDone={() => resolveLoop(q.key)}
                action={{ label: 'Reply', onClick: onFocusComposer }} />
            ))}
            {openLoops.promises.map(p => (
              <LoopRow key={p.key} icon={<Handshake size={13} />} tone="amber"
                label="Commitment" text={p.text}
                busy={busy === p.key || busy === `r-${p.key}`} onDone={() => resolveLoop(p.key)}
                action={contactId ? { label: 'Remind me', icon: <Bell size={11} />, onClick: () => remind(p.key, p.text, null) } : undefined} />
            ))}
            {openLoops.dates.map(d => (
              <LoopRow key={d.key} icon={<CalendarDays size={13} />} tone="violet"
                label={d.date ? shortDate(d.date) : 'Date to confirm'} text={d.title}
                busy={busy === d.key || busy === `r-${d.key}`} onDone={() => resolveLoop(d.key)}
                action={contactId ? { label: 'Remind me', icon: <Bell size={11} />, onClick: () => remind(d.key, d.title, d.date) } : undefined} />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

const TONES: Record<string, string> = {
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  sky: 'bg-sky-50 text-sky-600',
  violet: 'bg-violet-50 text-violet-600',
}

function LoopRow({ icon, tone, label, text, busy, onDone, action }: {
  icon: React.ReactNode
  tone: keyof typeof TONES
  label: string
  text: string
  busy: boolean
  onDone: () => void
  action?: { label: string; icon?: React.ReactNode; onClick: () => void }
}) {
  return (
    <li className="group flex items-start gap-2.5 rounded-xl px-1 py-1.5 hover:bg-gray-50">
      <span className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-[13px] leading-snug text-gray-800 line-clamp-3">{text}</p>
        {action && (
          <button onClick={action.onClick} disabled={busy} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
            {action.icon}{action.label}<ChevronRight size={11} />
          </button>
        )}
      </div>
      <button
        onClick={onDone}
        disabled={busy}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-300 hover:bg-white hover:text-emerald-600 disabled:opacity-50"
        title="Done — hide this"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={14} />}
      </button>
    </li>
  )
}
