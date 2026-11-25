'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Briefcase, Cake, CalendarHeart, Check, ExternalLink, Gift, Heart, Loader2, Pencil,
  Plus, Sparkles, StickyNote, X,
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { ZuriMark } from '@/components/ui/zuri-mark'

interface PersonData {
  person: { id: string; name: string; isGroup: boolean; relationshipType: string; isBusiness: boolean }
  stats: { firstMessageAt: string | null; lastMessageAt: string | null; totalMessages: number }
  about: {
    currentLifeContext: string | null
    personalitySummary: string | null
    communicationStyle: string | null
    preferences: string | null
    goals: string | null
    userEditedFields: string[]
    lastAnalyzedAt: string | null
  }
  facts: { id: string; text: string; mine: boolean; confidence: number | null; evidence: string | null }[]
  lifeEvents: { id: string; type: string; title: string; date: string | null }[]
  occasions: { id: string; type: string; title: string; date: string; nextDate: string; daysAway: number; yearly: boolean }[]
  notes: string | null
  business: {
    company: string | null; jobTitle: string | null; email: string | null
    customerStatus: string | null; pipelineStage: string | null; leadScore: number | null
  } | null
  relationshipTypes: string[]
}

interface GiftResult { ideas: { idea: string; why: string; price: string }[]; message: string; factCount: number }

const REL_LABEL: Record<string, string> = {
  spouse: 'Spouse', partner: 'Partner', family: 'Family', close_friend: 'Close friend', friend: 'Friend',
  colleague: 'Colleague', client: 'Client', business_contact: 'Business contact', acquaintance: 'Acquaintance',
}

const ABOUT_FIELDS: { key: keyof PersonData['about']; label: string; placeholder: string }[] = [
  { key: 'currentLifeContext', label: "What's going on for them", placeholder: 'Work, family, what they are dealing with right now…' },
  { key: 'personalitySummary', label: 'Who they are', placeholder: 'Personality, what matters to them…' },
  { key: 'communicationStyle', label: 'How they talk', placeholder: 'Short and direct, lots of voice notes, loves emojis…' },
  { key: 'preferences', label: 'Likes & preferences', placeholder: 'Food, music, hobbies, things they enjoy…' },
  { key: 'goals', label: "What they're working towards", placeholder: 'Plans, ambitions…' },
]

function since(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString([], { month: 'short', year: 'numeric' })
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

function whenLabel(daysAway: number): string {
  if (daysAway === 0) return 'Today'
  if (daysAway === 1) return 'Tomorrow'
  if (daysAway < 7) return `In ${daysAway} days`
  if (daysAway < 60) return `In ${Math.round(daysAway / 7)} weeks`
  return `In ${Math.round(daysAway / 30)} months`
}

function Section({ title, icon, right, children }: { title: string; icon: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">{icon}{title}</h3>
        {right}
      </div>
      {children}
    </section>
  )
}

export function PersonTab({
  contactId,
  token,
  onUseDraft,
}: {
  contactId: string
  token: string | null
  onUseDraft: (text: string) => void
}) {
  const { addToast } = useToast()
  const [data, setData] = useState<PersonData | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null)
  const [newFact, setNewFact] = useState('')
  const [notes, setNotes] = useState('')
  const [addingDate, setAddingDate] = useState<{ type: 'birthday' | 'anniversary'; date: string } | null>(null)
  const [gift, setGift] = useState<{ occasion: string; budget: string; result: GiftResult | null; loading: boolean } | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const d = await apiClient<PersonData>(`/api/contacts/${contactId}/zuri/person`, { token })
      setData(d)
      setNotes(d.notes ?? '')
      setError(false)
    } catch {
      setError(true)
    }
  }, [contactId, token])

  useEffect(() => { setData(null); setGift(null); setEditing(null); load() }, [load])

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

  const call = (path: string, method: string, body?: unknown) =>
    apiClient(path, { method, token: token!, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) })

  if (error && !data) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        Couldn&apos;t load what Zuri knows.
        <button onClick={() => load()} className="mt-2 block w-full text-xs font-semibold text-indigo-600">Try again</button>
      </div>
    )
  }
  if (!data) {
    return <div className="space-y-3 p-4">{[0, 1, 2, 3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-gray-100" />)}</div>
  }

  const firstName = data.person.name.split(' ')[0]
  const hasBirthday = data.occasions.some(o => o.type === 'birthday')
  const hasAnniversary = data.occasions.some(o => o.type === 'anniversary')
  const showAnniversary = ['spouse', 'partner'].includes(data.person.relationshipType)

  const runGift = async (occasion: string, budget: string) => {
    setGift({ occasion, budget, result: null, loading: true })
    try {
      const result = await apiClient<GiftResult>(`/api/contacts/${contactId}/zuri/gift-ideas`, {
        method: 'POST', token: token!,
        body: JSON.stringify({ occasion: occasion || undefined, budget: budget || undefined }),
      })
      setGift({ occasion, budget, result, loading: false })
    } catch (err) {
      setGift({ occasion, budget, result: null, loading: false })
      addToast({ variant: 'error', title: (err as { data?: { error?: string } })?.data?.error || 'Could not get ideas' })
    }
  }

  const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 placeholder:text-gray-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20'

  return (
    <div className="divide-y divide-gray-100 pb-6">
      {/* ── Relationship ── */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500"><Heart size={15} /></span>
          <select
            value={data.person.relationshipType}
            disabled={busy === 'rel' || data.person.isGroup}
            onChange={e => act('rel', () => call(`/api/contacts/${contactId}/zuri/relationship`, 'POST', { type: e.target.value }), 'Relationship updated')}
            className="min-h-9 flex-1 rounded-xl border border-gray-200 bg-white px-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            aria-label="Relationship"
          >
            {data.relationshipTypes.map(t => <option key={t} value={t}>{REL_LABEL[t] ?? t}</option>)}
          </select>
        </div>
        {data.stats.totalMessages > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            Talking since {since(data.stats.firstMessageAt)} · {data.stats.totalMessages.toLocaleString()} messages · last {ago(data.stats.lastMessageAt)}
          </p>
        )}
      </div>

      {/* ── Coming up ── */}
      <Section
        title="Coming up"
        icon={<CalendarHeart size={11} />}
        right={!gift && (
          <button onClick={() => setGift({ occasion: '', budget: '', result: null, loading: false })} className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
            <Gift size={12} /> Gift ideas
          </button>
        )}
      >
        {data.occasions.length === 0 && <p className="text-xs text-gray-400">No dates saved for {firstName} yet.</p>}
        <ul className="space-y-1">
          {data.occasions.slice(0, 5).map(o => (
            <li key={o.id} className="group flex items-center gap-2.5 rounded-xl px-1 py-1.5 hover:bg-gray-50">
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${o.type === 'birthday' ? 'bg-amber-50 text-amber-600' : o.type === 'anniversary' ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'}`}>
                {o.type === 'birthday' ? <Cake size={14} /> : <CalendarHeart size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-gray-800">{o.title}</p>
                <p className="text-[11px] text-gray-500">
                  {whenLabel(o.daysAway)} · {new Date(o.nextDate + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              </div>
              {o.yearly && (
                <button
                  onClick={() => runGift(o.type === 'birthday' ? `${firstName}'s birthday` : o.type === 'anniversary' ? 'our anniversary' : o.title, gift?.budget ?? '')}
                  className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50"
                >
                  <Gift size={12} /> Ideas
                </button>
              )}
              {(o.type === 'birthday' || o.type === 'anniversary') && (
                <button
                  onClick={() => act(o.id, () => call(`/api/contacts/${contactId}/zuri/dates/${o.id}`, 'DELETE'))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 opacity-0 hover:text-rose-500 group-hover:opacity-100"
                  title="Remove date"
                >
                  <X size={13} />
                </button>
              )}
            </li>
          ))}
        </ul>

        {addingDate ? (
          <div className="mt-2 flex items-center gap-2">
            <input type="date" value={addingDate.date} onChange={e => setAddingDate({ ...addingDate, date: e.target.value })} className={inputCls} autoFocus />
            <button
              disabled={!addingDate.date || busy === 'date'}
              onClick={() => act('date', () => call(`/api/contacts/${contactId}/zuri/dates`, 'POST', addingDate), 'Date saved').then(() => setAddingDate(null))}
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40"
              aria-label="Save date"
            >
              <Check size={15} />
            </button>
            <button onClick={() => setAddingDate(null)} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100" aria-label="Cancel">
              <X size={15} />
            </button>
          </div>
        ) : (!hasBirthday || (showAnniversary && !hasAnniversary)) && !data.person.isGroup && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {!hasBirthday && (
              <button onClick={() => setAddingDate({ type: 'birthday', date: '' })} className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-gray-100 px-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
                <Plus size={12} /> Birthday
              </button>
            )}
            {showAnniversary && !hasAnniversary && (
              <button onClick={() => setAddingDate({ type: 'anniversary', date: '' })} className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-gray-100 px-2.5 text-[11px] font-semibold text-gray-600 hover:bg-gray-200">
                <Plus size={12} /> Anniversary
              </button>
            )}
          </div>
        )}

        {/* Gift helper */}
        {gift && (
          <div className="mt-3 rounded-2xl bg-gradient-to-br from-amber-50 via-white to-rose-50 p-3 ring-1 ring-amber-100">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700"><Gift size={12} /> Gift ideas for {firstName}</p>
              <button onClick={() => setGift(null)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-white" aria-label="Close gift ideas"><X size={13} /></button>
            </div>
            <div className="grid grid-cols-[1fr_6.5rem] gap-2">
              <input value={gift.occasion} onChange={e => setGift({ ...gift, occasion: e.target.value })} placeholder="Occasion (optional)" className={inputCls} />
              <input value={gift.budget} onChange={e => setGift({ ...gift, budget: e.target.value })} placeholder="Budget" className={inputCls} />
            </div>
            <button
              onClick={() => runGift(gift.occasion, gift.budget)}
              disabled={gift.loading}
              className="mt-2 inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-60"
            >
              {gift.loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {gift.result ? 'Try again' : 'Suggest gifts'}
            </button>
            {gift.result && (
              <div className="mt-3 space-y-2">
                {gift.result.factCount < 3 && (
                  <p className="text-[11px] text-amber-700/80">Zuri doesn&apos;t know much about {firstName} yet — add a few things below for better ideas.</p>
                )}
                {gift.result.ideas.map((g, i) => (
                  <div key={i} className="rounded-xl bg-white/90 p-2.5 ring-1 ring-amber-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-semibold text-gray-900">{g.idea}</p>
                      {g.price && <span className="flex-shrink-0 text-[11px] font-semibold text-amber-700">{g.price}</span>}
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-gray-600">{g.why}</p>
                  </div>
                ))}
                {gift.result.message && (
                  <div className="rounded-xl bg-white/90 p-2.5 ring-1 ring-indigo-100">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500">Message</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-gray-800">{gift.result.message}</p>
                    <button onClick={() => onUseDraft(gift.result!.message)} className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
                      <Pencil size={11} /> Use this message
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {/* ── About ── */}
      <Section title={`About ${firstName}`} icon={<ZuriMark size={13} />}>
        <div className="space-y-2.5">
          {ABOUT_FIELDS.map(f => {
            const value = data.about[f.key] as string | null
            const edited = data.about.userEditedFields.includes(f.key)
            if (editing?.key === f.key) {
              return (
                <div key={f.key}>
                  <p className="mb-1 text-[11px] font-semibold text-gray-500">{f.label}</p>
                  <textarea value={editing.value} onChange={e => setEditing({ key: f.key, value: e.target.value })} rows={3} autoFocus placeholder={f.placeholder} className={`${inputCls} resize-none`} />
                  <div className="mt-1 flex gap-1.5">
                    <button
                      disabled={busy === f.key}
                      onClick={() => act(f.key, () => call(`/api/contacts/${contactId}/profile`, 'PATCH', { field: f.key, value: editing.value.trim() || null, lockAction: 'lock' }), 'Saved').then(() => setEditing(null))}
                      className="inline-flex min-h-8 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Check size={12} /> Save
                    </button>
                    <button onClick={() => setEditing(null)} className="min-h-8 rounded-xl px-3 text-xs font-semibold text-gray-600 hover:bg-gray-100">Cancel</button>
                  </div>
                </div>
              )
            }
            if (!value) {
              return (
                <button key={f.key} onClick={() => setEditing({ key: f.key, value: '' })} className="flex w-full items-center gap-1 text-left text-[12px] text-gray-400 hover:text-indigo-600">
                  <Plus size={12} /> {f.label}
                </button>
              )
            }
            return (
              <div key={f.key} className="group">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold text-gray-500">{f.label}</p>
                  {edited && <span className="rounded-full bg-indigo-50 px-1.5 text-[9px] font-semibold text-indigo-600">edited by you</span>}
                  <button onClick={() => setEditing({ key: f.key, value })} className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 hover:bg-gray-100 hover:text-gray-600 sm:opacity-0 sm:group-hover:opacity-100" aria-label={`Edit ${f.label}`}>
                    <Pencil size={12} />
                  </button>
                </div>
                <p className="text-[13px] leading-snug text-gray-800">{value}</p>
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── Things to remember ── */}
      <Section title="Things to remember" icon={<Sparkles size={11} />}>
        {data.facts.length === 0 && <p className="mb-2 text-xs text-gray-400">Nothing yet. Zuri learns as you chat — or add something below.</p>}
        <ul className="space-y-0.5">
          {data.facts.map(f => (
            <li key={f.id} className="group flex items-start gap-2 rounded-xl px-1 py-1.5 hover:bg-gray-50">
              <span className={`mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full ${f.mine ? 'bg-indigo-500' : 'bg-gray-300'}`} />
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-gray-800" title={f.evidence ?? undefined}>
                {f.text}
                {f.mine && <span className="ml-1 text-[10px] font-semibold text-indigo-500">you</span>}
              </p>
              <button
                disabled={busy === f.id}
                onClick={() => act(f.id, () => call(`/api/contacts/${contactId}/zuri/facts/${f.id}/reject`, 'POST'), f.mine ? 'Removed' : "Got it — Zuri won't use that")}
                className="flex h-7 flex-shrink-0 items-center gap-1 rounded-lg px-1.5 text-[11px] font-medium text-gray-300 hover:bg-white hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100"
                title={f.mine ? 'Remove' : "That's wrong"}
              >
                {busy === f.id ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                <span className="hidden sm:inline">{f.mine ? 'Remove' : 'Wrong'}</span>
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={e => {
            e.preventDefault()
            const text = newFact.trim()
            if (text.length < 2) return
            act('fact', () => call(`/api/contacts/${contactId}/zuri/facts`, 'POST', { text }), 'Zuri will remember that').then(() => setNewFact(''))
          }}
        >
          <input value={newFact} onChange={e => setNewFact(e.target.value)} placeholder={`Something to remember about ${firstName}`} className={inputCls} />
          <button type="submit" disabled={busy === 'fact' || newFact.trim().length < 2} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white disabled:opacity-40" aria-label="Add">
            {busy === 'fact' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={15} />}
          </button>
        </form>
      </Section>

      {/* ── Life events ── */}
      {data.lifeEvents.length > 0 && (
        <Section title="Life events" icon={<CalendarHeart size={11} />}>
          <ul className="space-y-1.5">
            {data.lifeEvents.map(e => (
              <li key={e.id} className="flex items-baseline gap-2 text-[13px]">
                <span className="h-1.5 w-1.5 flex-shrink-0 translate-y-[-1px] rounded-full bg-violet-300" />
                <span className="min-w-0 flex-1 text-gray-800">{e.title}</span>
                {e.date && <span className="flex-shrink-0 text-[11px] text-gray-400">{since(e.date)}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* ── Private notes ── */}
      <Section title="Private notes" icon={<StickyNote size={11} />} right={busy === 'notes' ? <Loader2 size={12} className="animate-spin text-gray-400" /> : undefined}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => {
            if ((data.notes ?? '') === notes) return
            act('notes', () => call(`/api/contacts/${contactId}`, 'PATCH', { notes: notes.trim() || null }))
          }}
          rows={3}
          placeholder="Only you see these. Saved automatically."
          className={`${inputCls} resize-none`}
        />
      </Section>

      {/* ── Business (business contacts only) ── */}
      {data.business && (
        <Section title="Business" icon={<Briefcase size={11} />}>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
            {([
              ['Company', data.business.company],
              ['Role', data.business.jobTitle],
              ['Email', data.business.email],
              ['Status', data.business.customerStatus],
              ['Stage', data.business.pipelineStage?.replace(/_/g, ' ')],
              ['Lead score', data.business.leadScore ? String(data.business.leadScore) : null],
            ] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] text-gray-400">{k}</dt>
                <dd className="truncate font-medium capitalize text-gray-800">{v}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <div className="px-4 pt-3">
        <a href={`/contacts/${contactId}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-indigo-600">
          Full profile, privacy & analysis settings <ExternalLink size={11} />
        </a>
      </div>
    </div>
  )
}
