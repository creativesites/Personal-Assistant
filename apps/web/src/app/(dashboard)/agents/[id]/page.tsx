'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface AgentDetail {
  agent: {
    id: string; name: string; agent_type: string; description: string | null
    trust_level: string; is_active: boolean; system_prompt: string | null
    can_send_links: boolean; can_share_pricing: boolean; can_book_meetings: boolean
    max_messages_per_day: number
    escalate_on_frustration: boolean; escalate_on_explicit_human_request: boolean; escalate_on_out_of_scope: boolean
    createdAt: string
  }
  actions: { id: string; action_type: string; input_message: string | null; output_message: string | null; was_escalated: boolean; created_at: string }[]
  assignments: { id: string; contact_id: string | null; contact_name: string | null; segment_tag: string | null }[]
}

const TRUST_LEVELS = ['observe', 'suggest', 'assisted', 'delegated', 'autonomous'] as const
const TRUST_DESC: Record<string, string> = {
  observe:    'Only reads conversations — never sends anything',
  suggest:    'Drafts replies for your review before sending',
  assisted:   'Sends routine replies; escalates anything complex',
  delegated:  'Handles most conversations; notifies you of outcomes',
  autonomous: 'Fully autonomous — you see escalations only',
}

export default function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const session = useZuriSession()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<AgentDetail>(`/api/agents/${id}`, token)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'config' | 'actions' | 'assignments'>('config')

  const patch = async (body: Record<string, unknown>) => {
    if (!token) return
    setSaving(true)
    try {
      await apiClient(`/api/agents/${id}`, { method: 'PATCH', token, body: JSON.stringify(body) })
      await refetch()
    } finally {
      setSaving(false)
    }
  }

  if (loading || !data) {
    return <div className="flex-1 flex items-center justify-center"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  }

  const { agent, actions, assignments } = data

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.push('/agents')} className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">{agent.name}</h1>
            <p className="text-gray-500 text-sm capitalize">{agent.agent_type.replace('_', ' ')} agent</p>
          </div>
          <button onClick={() => patch({ is_active: !agent.is_active })}
            className={`relative w-10 h-6 rounded-full transition-colors ${agent.is_active ? 'bg-indigo-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${agent.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-5 gap-1">
          {(['config', 'actions', 'assignments'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors capitalize border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t} {t === 'actions' && `(${actions.length})`} {t === 'assignments' && `(${assignments.length})`}
            </button>
          ))}
        </div>

        {tab === 'config' && (
          <div className="space-y-4">
            {/* Trust level */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Automation level</p>
              <div className="space-y-2">
                {TRUST_LEVELS.map(level => (
                  <button key={level} onClick={() => patch({ trust_level: level })}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${agent.trust_level === level ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex-shrink-0 ${agent.trust_level === level ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'}`} />
                    <div>
                      <p className={`text-sm font-medium capitalize ${agent.trust_level === level ? 'text-indigo-700' : 'text-gray-700'}`}>{level}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{TRUST_DESC[level]}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* System prompt */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-1">System prompt</p>
              <p className="text-xs text-gray-500 mb-3">Instructions that define the agent's role, tone, and behaviour</p>
              <SystemPromptEditor value={agent.system_prompt ?? ''} onSave={v => patch({ system_prompt: v })} saving={saving} />
            </div>

            {/* Permissions */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Permissions</p>
              <div className="space-y-3">
                {[
                  { key: 'can_send_links', label: 'Can send links', desc: 'Agent may include URLs in messages' },
                  { key: 'can_share_pricing', label: 'Can share pricing', desc: 'Agent may quote prices and fees' },
                  { key: 'can_book_meetings', label: 'Can book meetings', desc: 'Agent may schedule via Calendly / Cal.com' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-700">{label}</p>
                      <p className="text-xs text-gray-400">{desc}</p>
                    </div>
                    <button onClick={() => patch({ [key]: !(agent as unknown as Record<string,boolean>)[key] })}
                      className={`relative w-9 h-5 rounded-full transition-colors ${(agent as unknown as Record<string,boolean>)[key] ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(agent as unknown as Record<string,boolean>)[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">Max messages per day</p>
                  <MaxMessagesInput value={agent.max_messages_per_day} onSave={v => patch({ max_messages_per_day: v })} />
                </div>
              </div>
            </div>

            {/* Escalation triggers */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm font-semibold text-gray-900 mb-3">Escalate to human when…</p>
              <div className="space-y-3">
                {[
                  { key: 'escalate_on_frustration', label: 'Customer shows frustration' },
                  { key: 'escalate_on_explicit_human_request', label: 'Customer asks for a human' },
                  { key: 'escalate_on_out_of_scope', label: 'Question is outside the agent\'s scope' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">{label}</p>
                    <button onClick={() => patch({ [key]: !(agent as unknown as Record<string,boolean>)[key] })}
                      className={`relative w-9 h-5 rounded-full transition-colors ${(agent as unknown as Record<string,boolean>)[key] ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${(agent as unknown as Record<string,boolean>)[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'actions' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {actions.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">No actions yet — agent hasn&apos;t responded to any conversations</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {actions.map(a => (
                  <div key={a.id} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${a.was_escalated ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                        {a.was_escalated ? 'Escalated' : a.action_type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    {a.input_message && <p className="text-xs text-gray-500 mb-1">↳ {a.input_message.slice(0, 120)}{a.input_message.length > 120 ? '…' : ''}</p>}
                    {a.output_message && <p className="text-xs text-gray-700">⤷ {a.output_message.slice(0, 120)}{a.output_message.length > 120 ? '…' : ''}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'assignments' && (
          <AssignmentsTab agentId={id} assignments={assignments} token={token} onRefresh={refetch} />
        )}
      </div>
    </div>
  )
}

function SystemPromptEditor({ value, onSave, saving }: { value: string; onSave: (v: string) => void; saving: boolean }) {
  const [draft, setDraft] = useState(value)
  const changed = draft !== value
  return (
    <div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={6}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none font-mono" />
      {changed && (
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={() => setDraft(value)} className="text-xs text-gray-500 hover:text-gray-700">Discard</button>
          <button onClick={() => onSave(draft)} disabled={saving} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

function MaxMessagesInput({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value))
  return (
    <div className="flex items-center gap-2">
      <input type="number" min={1} max={500} value={v} onChange={e => setV(e.target.value)}
        className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      <span className="text-xs text-gray-400">messages/day</span>
      {String(value) !== v && (
        <button onClick={() => onSave(parseInt(v, 10))} className="text-xs bg-indigo-600 text-white px-2.5 py-1 rounded-lg hover:bg-indigo-700">Save</button>
      )}
    </div>
  )
}

function AssignmentsTab({ agentId, assignments, token, onRefresh }: {
  agentId: string
  assignments: AgentDetail['assignments']
  token: string | null | undefined
  onRefresh: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [segmentTag, setSegmentTag] = useState('')
  const [saving, setSaving] = useState(false)

  const addSegment = async () => {
    if (!token || !segmentTag.trim()) return
    setSaving(true)
    try {
      await apiClient(`/api/agents/${agentId}/assignments`, { method: 'POST', token, body: JSON.stringify({ segment_tag: segmentTag.trim() }) })
      setSegmentTag('')
      setAdding(false)
      onRefresh()
    } finally { setSaving(false) }
  }

  const remove = async (assignmentId: string) => {
    if (!token) return
    await apiClient(`/api/agents/${agentId}/assignments/${assignmentId}`, { method: 'DELETE', token })
    onRefresh()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">Assigned contacts & segments</p>
        <button onClick={() => setAdding(true)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">+ Add segment</button>
      </div>
      {adding && (
        <div className="px-5 py-3 bg-indigo-50 border-b border-indigo-100 flex items-center gap-3">
          <input value={segmentTag} onChange={e => setSegmentTag(e.target.value)} placeholder="e.g. customer, lead, vip"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={addSegment} disabled={saving || !segmentTag.trim()} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50">Add</button>
          <button onClick={() => setAdding(false)} className="text-xs text-gray-500">Cancel</button>
        </div>
      )}
      {assignments.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">No assignments — agent won&apos;t activate on any conversations</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {assignments.map(a => (
            <div key={a.id} className="px-5 py-3 flex items-center justify-between">
              <div>
                {a.contact_name && <p className="text-sm text-gray-700 font-medium">{a.contact_name}</p>}
                {a.segment_tag && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">#{a.segment_tag}</span>}
              </div>
              <button onClick={() => remove(a.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
