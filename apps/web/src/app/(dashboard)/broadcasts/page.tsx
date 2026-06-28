'use client'

import { useState } from 'react'
import { Radio, CheckCircle, XCircle, Plus } from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface Broadcast {
  id: string
  name: string
  message_template: string
  status: string
  total_recipients: number
  sent_count: number
  failed_count: number
  scheduled_at: string | null
  sent_at: string | null
  createdAt: string
}

interface BroadcastsResponse { broadcasts: Broadcast[]; total: number }

const STATUS_STYLE: Record<string, string> = {
  draft:      'bg-gray-100 text-gray-500',
  scheduled:  'bg-blue-50 text-blue-600',
  sending:    'bg-amber-50 text-amber-600',
  sent:       'bg-green-50 text-green-600',
  cancelled:  'bg-red-50 text-red-500',
}

export default function BroadcastsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<BroadcastsResponse>('/api/broadcasts', token)
  const broadcasts = data?.broadcasts ?? []

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', message_template: '', scheduled_at: '' })

  const create = async () => {
    if (!token || !form.name.trim() || !form.message_template.trim()) return
    setCreating(true)
    try {
      const body: Record<string, string> = { name: form.name, message_template: form.message_template, segment_filter: '{}' }
      if (form.scheduled_at) body.scheduled_at = form.scheduled_at
      await apiClient('/api/broadcasts', { method: 'POST', token, body: JSON.stringify(body) })
      setShowCreate(false)
      setForm({ name: '', message_template: '', scheduled_at: '' })
      await refetch()
    } finally { setCreating(false) }
  }

  const sendNow = async (id: string) => {
    if (!token || !confirm('Send this broadcast now to all matching contacts?')) return
    setSending(id)
    try {
      await apiClient(`/api/broadcasts/${id}/send`, { method: 'POST', token })
      await refetch()
    } finally { setSending(null) }
  }

  const cancel = async (id: string) => {
    if (!token) return
    await apiClient(`/api/broadcasts/${id}/cancel`, { method: 'POST', token })
    await refetch()
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Broadcasts</h1>
            <p className="text-gray-500 text-sm mt-0.5">Send personalised bulk messages to contact segments</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            New broadcast
          </button>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">New broadcast</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. January check-in" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message template</label>
                  <p className="text-xs text-gray-400 mb-1">Use {'{{name}}'} for personalisation</p>
                  <textarea value={form.message_template} onChange={e => setForm(f => ({...f, message_template: e.target.value}))} rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    placeholder={`Hey {{name}}, just checking in…`} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Schedule (optional)</label>
                  <input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({...f, scheduled_at: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button disabled={creating || !form.name.trim() || !form.message_template.trim()} onClick={create}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />)}</div>
        ) : broadcasts.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Radio className="w-7 h-7 text-indigo-500" />
            </div>
            <p className="text-gray-900 font-semibold mb-1">No broadcasts yet</p>
            <p className="text-gray-500 text-sm mb-4">Reach multiple contacts with a personalised message</p>
            <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" />
              Create first broadcast
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {broadcasts.map(b => (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-semibold text-gray-900">{b.name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_STYLE[b.status] ?? STATUS_STYLE.draft}`}>{b.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{b.message_template.slice(0, 80)}{b.message_template.length > 80 ? '…' : ''}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {b.status === 'draft' && (
                      <button onClick={() => sendNow(b.id)} disabled={sending === b.id}
                        className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors">
                        {sending === b.id ? 'Sending…' : 'Send now'}
                      </button>
                    )}
                    {b.status === 'scheduled' && (
                      <button onClick={() => cancel(b.id)} className="text-xs px-3 py-1.5 border border-red-200 text-red-500 rounded-lg hover:bg-red-50 font-medium transition-colors">Cancel</button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  {b.status === 'sent' && (
                    <>
                      <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {b.sent_count} sent
                      </span>
                      {b.failed_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          {b.failed_count} failed
                        </span>
                      )}
                      {b.sent_at && <span>{new Date(b.sent_at).toLocaleString()}</span>}
                    </>
                  )}
                  {b.status === 'scheduled' && b.scheduled_at && <span>Scheduled for {new Date(b.scheduled_at).toLocaleString()}</span>}
                  {b.status === 'draft' && <span>Created {new Date(b.createdAt).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
