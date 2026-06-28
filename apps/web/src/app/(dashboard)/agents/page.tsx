'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'

interface Agent {
  id: string
  name: string
  agent_type: string
  description: string | null
  trust_level: string
  is_active: boolean
  assignment_count: number
  action_count: number
  createdAt: string
}

interface AgentsResponse { agents: Agent[] }

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  sales:             { label: 'Sales',             icon: '💼', color: 'bg-blue-900/40 text-blue-300 border-blue-800' },
  support:           { label: 'Support',           icon: '🎧', color: 'bg-green-900/40 text-green-300 border-green-800' },
  community_manager: { label: 'Community Mgr',     icon: '🌐', color: 'bg-purple-900/40 text-purple-300 border-purple-800' },
  custom:            { label: 'Custom',            icon: '⚙️', color: 'bg-gray-800 text-gray-300 border-gray-700' },
}

const TRUST_META: Record<string, { label: string; color: string }> = {
  observe:    { label: 'Observe only',  color: 'text-gray-400' },
  suggest:    { label: 'Suggest',       color: 'text-blue-400' },
  assisted:   { label: 'Assisted',      color: 'text-yellow-400' },
  delegated:  { label: 'Delegated',     color: 'text-orange-400' },
  autonomous: { label: 'Autonomous',    color: 'text-green-400' },
}

const AGENT_TYPES = ['sales', 'support', 'community_manager', 'custom'] as const
const TRUST_LEVELS = ['observe', 'suggest', 'assisted', 'delegated', 'autonomous'] as const

export default function AgentsPage() {
  const session = useZuriSession()
  const router = useRouter()
  const token = session.data?.accessToken
  const { data, loading, refetch } = useApi<AgentsResponse>('/api/agents', token)
  const agents = data?.agents ?? []

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', agent_type: 'support', description: '', trust_level: 'suggest' })

  const createAgent = async () => {
    if (!token || !form.name.trim()) return
    setCreating(true)
    try {
      await apiClient('/api/agents', { method: 'POST', token, body: JSON.stringify(form) })
      setShowCreate(false)
      setForm({ name: '', agent_type: 'support', description: '', trust_level: 'suggest' })
      await refetch()
    } finally {
      setCreating(false)
    }
  }

  const toggleActive = async (agent: Agent) => {
    if (!token) return
    await apiClient(`/api/agents/${agent.id}`, { method: 'PATCH', token, body: JSON.stringify({ is_active: !agent.is_active }) })
    await refetch()
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">AI Agents</h1>
            <p className="text-gray-500 text-sm mt-0.5">Autonomous agents that handle conversations on your behalf</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">
            + New agent
          </button>
        </div>

        {/* Create modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Create agent</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Support Bot" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.agent_type} onChange={e => setForm(f => ({...f, agent_type: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {AGENT_TYPES.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trust level</label>
                  <select value={form.trust_level} onChange={e => setForm(f => ({...f, trust_level: e.target.value}))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {TRUST_LEVELS.map(t => <option key={t} value={t}>{TRUST_META[t].label}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Observe = read only · Autonomous = sends without approval</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="What does this agent do?" />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                <button disabled={creating || !form.name.trim()} onClick={createAgent}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create agent'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Agent list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-24 bg-white rounded-xl border border-gray-200 animate-pulse" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-4xl mb-3">🤖</div>
            <p className="text-gray-900 font-semibold mb-1">No agents yet</p>
            <p className="text-gray-500 text-sm mb-4">Create an agent to handle conversations autonomously</p>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700">
              Create first agent
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map(agent => {
              const tm = TYPE_META[agent.agent_type] ?? TYPE_META.custom
              const trust = TRUST_META[agent.trust_level] ?? TRUST_META.suggest
              return (
                <div key={agent.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-xl flex-shrink-0">
                      {tm.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button onClick={() => router.push(`/agents/${agent.id}`)} className="text-gray-900 font-semibold text-sm hover:text-indigo-600 transition-colors">
                          {agent.name}
                        </button>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tm.color}`}>{tm.label}</span>
                        <span className={`text-xs font-medium ${trust.color}`}>{trust.label}</span>
                        {agent.is_active && <span className="text-xs bg-green-50 text-green-600 border border-green-200 px-2 py-0.5 rounded-full font-medium">Active</span>}
                      </div>
                      {agent.description && <p className="text-gray-500 text-xs mb-2">{agent.description}</p>}
                      <div className="flex items-center gap-4 text-xs text-gray-400">
                        <span>{agent.assignment_count} contacts assigned</span>
                        <span>{agent.action_count} actions taken</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleActive(agent)}
                        className={`relative w-9 h-5 rounded-full transition-colors ${agent.is_active ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${agent.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                      <button onClick={() => router.push(`/agents/${agent.id}`)} className="text-xs text-indigo-500 hover:text-indigo-700 font-medium">
                        Configure →
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Knowledge base link */}
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-gray-900 font-semibold text-sm">Knowledge Base</p>
            <p className="text-gray-500 text-xs mt-0.5">Upload documents and URLs your agents can reference</p>
          </div>
          <button onClick={() => router.push('/knowledge-base')} className="text-sm text-indigo-600 hover:text-indigo-700 font-medium">
            Manage →
          </button>
        </div>
      </div>
    </div>
  )
}
