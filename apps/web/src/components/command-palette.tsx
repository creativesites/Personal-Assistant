'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, CheckSquare, Download, Handshake, Heart, RefreshCw, Search, Sparkles, User, X } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { useToast } from '@/components/ui'
import { downloadCsv } from '@/lib/export-csv'

interface ContactLite { id: string; name: string }

type View = 'root' | 'pick-contact' | 'create-deal'
type PendingAction = 'task' | 'health' | 'deal' | null

async function exportRelationships(token: string) {
  const data = await apiClient<{ relationships: Array<Record<string, unknown>> }>('/api/relationships', { token })
  downloadCsv('relationship-feed.csv', data.relationships.map(r => ({
    name: r.name,
    relationshipType: r.relationshipType,
    healthScore: r.healthScore,
    healthTrend: r.healthTrend,
    lastInteractionAt: r.lastInteractionAt,
    revenueCents: r.revenueCents,
    currentDealStage: (r.currentDeal as { stage?: string } | null)?.stage ?? '',
  })))
}

async function exportLeads(token: string) {
  const data = await apiClient<{ leads: Array<Record<string, unknown>> }>('/api/leads', { token })
  downloadCsv('leads.csv', data.leads.map(l => ({
    name: l.name,
    phone: l.phone,
    email: l.email,
    company: l.company,
    customerStatus: l.customerStatus,
    pipelineStage: l.pipelineStage,
    leadScore: l.leadScore,
  })))
}

// Cmd+K command palette (docs/RELATIONSHIP_OS_PLAN.md §11) — a single
// global, frontend-only component that only dispatches to routes/endpoints
// that already exist (navigation, /api/deals, /api/relationships,
// /api/leads, /api/contacts/:id/recalculate-health).
export function CommandPalette() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const router = useRouter()
  const { addToast } = useToast()

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [contacts, setContacts] = useState<ContactLite[]>([])
  const [view, setView] = useState<View>('root')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [selectedContact, setSelectedContact] = useState<ContactLite | null>(null)
  const [dealTitle, setDealTitle] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setOpen(false)
    setQuery('')
    setView('root')
    setPendingAction(null)
    setSelectedContact(null)
    setDealTitle('')
    setDealValue('')
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      } else if (e.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!open || !token) return
    apiClient<{ contacts: ContactLite[] }>('/api/contacts', { token })
      .then(data => setContacts(data.contacts))
      .catch(() => setContacts([]))
  }, [open, token])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const matchingContacts = useMemo(() => {
    if (!query) return contacts.slice(0, 8)
    return contacts.filter(c => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
  }, [contacts, query])

  const staticActions = useMemo(() => [
    { key: 'advisor', label: 'Ask AI Advisor', Icon: Brain, run: () => { router.push('/advisor'); close() } },
    { key: 'relationships', label: 'View Relationships', Icon: Heart, run: () => { router.push('/relationships'); close() } },
    { key: 'proactive', label: 'View Recommendations', Icon: Sparkles, run: () => { router.push('/proactive'); close() } },
    {
      key: 'export-relationships', label: 'Export Relationship Feed (CSV)', Icon: Download,
      run: async () => { if (token) await exportRelationships(token); close() },
    },
    {
      key: 'export-leads', label: 'Export Leads (CSV)', Icon: Download,
      run: async () => { if (token) await exportLeads(token); close() },
    },
    { key: 'create-deal', label: 'Create Deal…', Icon: Handshake, run: () => { setPendingAction('deal'); setView('pick-contact'); setQuery('') } },
    { key: 'add-task', label: 'Add Task…', Icon: CheckSquare, run: () => { setPendingAction('task'); setView('pick-contact'); setQuery('') } },
    { key: 'recalc-health', label: 'Run Health Recalculation…', Icon: RefreshCw, run: () => { setPendingAction('health'); setView('pick-contact'); setQuery('') } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [token, router])

  const filteredActions = query
    ? staticActions.filter(a => a.label.toLowerCase().includes(query.toLowerCase()))
    : staticActions

  async function pickContact(contact: ContactLite) {
    if (pendingAction === 'task') {
      router.push(`/contacts/${contact.id}?tab=activity`)
      close()
    } else if (pendingAction === 'health') {
      if (!token) return
      setBusy(true)
      try {
        const res = await apiClient<{ healthScore: number }>(`/api/contacts/${contact.id}/recalculate-health`, {
          method: 'POST', token,
        })
        addToast({ variant: 'success', title: 'Health recalculated', description: `${contact.name}: ${res.healthScore}/100` })
      } catch {
        addToast({ variant: 'error', title: 'Could not recalculate health' })
      } finally {
        setBusy(false)
        close()
      }
    } else if (pendingAction === 'deal') {
      setSelectedContact(contact)
      setDealTitle(`Deal with ${contact.name}`)
      setView('create-deal')
    }
  }

  async function submitDeal() {
    if (!selectedContact || !dealTitle.trim() || !token) return
    setBusy(true)
    try {
      await apiClient('/api/deals', {
        method: 'POST', token,
        body: JSON.stringify({
          contactId: selectedContact.id,
          title: dealTitle.trim(),
          valueCents: dealValue ? Math.round(parseFloat(dealValue) * 100) : undefined,
        }),
      })
      addToast({ variant: 'success', title: 'Deal created', description: dealTitle })
    } catch {
      addToast({ variant: 'error', title: 'Could not create deal' })
    } finally {
      setBusy(false)
      close()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        {view !== 'create-deal' && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
            <Search size={16} className="text-gray-400 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={view === 'pick-contact' ? 'Search contacts…' : 'Search actions or contacts…'}
              className="flex-1 text-sm outline-none"
            />
            {view !== 'root' && (
              <button
                onClick={() => { setView('root'); setPendingAction(null); setQuery('') }}
                className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                Back
              </button>
            )}
            <button onClick={close} className="text-gray-300 hover:text-gray-500 flex-shrink-0"><X size={16} /></button>
          </div>
        )}

        {view === 'root' && (
          <div className="max-h-96 overflow-y-auto py-2">
            {filteredActions.length > 0 && (
              <div className="px-2 pb-1">
                {filteredActions.map(a => (
                  <button
                    key={a.key}
                    onClick={() => a.run()}
                    disabled={busy}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
                  >
                    <a.Icon size={15} className="text-gray-400 flex-shrink-0" />
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {matchingContacts.length > 0 && (
              <div className="px-2 pt-1 border-t border-gray-50">
                <p className="px-3 py-1 text-[10px] text-gray-400 uppercase tracking-wide font-medium">Contacts</p>
                {matchingContacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => { router.push(`/contacts/${c.id}`); close() }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
                  >
                    <User size={15} className="text-gray-400 flex-shrink-0" />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
            {filteredActions.length === 0 && matchingContacts.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No matches</p>
            )}
          </div>
        )}

        {view === 'pick-contact' && (
          <div className="max-h-96 overflow-y-auto py-2">
            {matchingContacts.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">No contacts match</p>
            ) : (
              <div className="px-2">
                {matchingContacts.map(c => (
                  <button
                    key={c.id}
                    onClick={() => pickContact(c)}
                    disabled={busy}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 text-left"
                  >
                    <User size={15} className="text-gray-400 flex-shrink-0" />
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {view === 'create-deal' && selectedContact && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">New deal — {selectedContact.name}</p>
              <button onClick={close} className="text-gray-300 hover:text-gray-500"><X size={16} /></button>
            </div>
            <input
              autoFocus
              value={dealTitle}
              onChange={e => setDealTitle(e.target.value)}
              placeholder="Deal title"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              value={dealValue}
              onChange={e => setDealValue(e.target.value)}
              placeholder="Value (optional)"
              type="number"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={submitDeal}
              disabled={!dealTitle.trim() || busy}
              className="w-full text-sm bg-indigo-600 text-white rounded-lg py-2 disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create deal'}
            </button>
          </div>
        )}

        <div className="px-4 py-2 border-t border-gray-50 text-[10px] text-gray-400 flex items-center justify-between">
          <span>Search actions and contacts</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  )
}
