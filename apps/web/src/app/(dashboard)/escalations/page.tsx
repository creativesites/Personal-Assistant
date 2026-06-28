'use client'

import { useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useApi } from '@/hooks/use-api'
import { apiClient } from '@/lib/api'
import { AlertCircle, UserX, HelpCircle, AlertOctagon, CheckCircle2 } from 'lucide-react'

interface Escalation {
  id: string
  reason: string
  urgency: string
  status: string
  context_summary: string | null
  contact_name: string | null
  agent_name: string
  conversation_id: string
  created_at: string
}

interface EscalationsResponse { escalations: Escalation[]; total: number }

const URGENCY_STYLE: Record<string, string> = {
  low:      'bg-gray-100 text-gray-500',
  normal:   'bg-blue-50 text-blue-600',
  high:     'bg-orange-50 text-orange-600',
  critical: 'bg-red-100 text-red-700 font-bold',
}

const REASON_LABEL: Record<string, { label: string; Icon: React.ElementType }> = {
  frustration:      { label: 'Frustration detected', Icon: AlertCircle },
  explicit_request: { label: 'Asked for human',      Icon: UserX },
  out_of_scope:     { label: 'Out of scope',          Icon: HelpCircle },
  other:            { label: 'Other',                 Icon: AlertOctagon },
}

const STATUS_FILTER = ['pending', 'in_progress', 'resolved'] as const

export default function EscalationsPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [statusFilter, setStatusFilter] = useState<string>('pending')
  const { data, loading, refetch } = useApi<EscalationsResponse>(`/api/escalations?status=${statusFilter}`, token)
  const escalations = data?.escalations ?? []
  const total = data?.total ?? 0

  const updateStatus = async (id: string, status: string) => {
    if (!token) return
    await apiClient(`/api/escalations/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status }) })
    await refetch()
  }

  const pendingCount = statusFilter === 'pending' ? total : 0

  return (
    <div className="flex-1 overflow-auto bg-gray-50 px-4 md:px-6 py-5 pt-16 pb-20 md:pt-5 md:pb-5">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Requires Human Attention</h1>
            <p className="text-gray-500 text-sm mt-0.5">Conversations your AI agents escalated</p>
          </div>
          {pendingCount > 0 && (
            <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-bold rounded-full">{pendingCount} pending</span>
          )}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 mb-5">
          {STATUS_FILTER.map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${statusFilter === s ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-28 bg-white rounded-xl border border-gray-200 animate-pulse" />)}</div>
        ) : escalations.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="text-gray-900 font-semibold mb-1">
              {statusFilter === 'pending' ? 'No pending escalations' : `No ${statusFilter.replace('_', ' ')} escalations`}
            </p>
            <p className="text-gray-500 text-sm">Your agents are handling everything smoothly</p>
          </div>
        ) : (
          <div className="space-y-3">
            {escalations.map(e => (
              <div key={e.id} className={`bg-white rounded-xl border p-5 ${e.urgency === 'critical' ? 'border-red-300' : e.urgency === 'high' ? 'border-orange-300' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-gray-900">{e.contact_name ?? 'Unknown contact'}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_STYLE[e.urgency]}`}>{e.urgency}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        {REASON_LABEL[e.reason] ? (
                          <>
                            <REASON_LABEL[e.reason].Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            {REASON_LABEL[e.reason].label}
                          </>
                        ) : e.reason}
                      </span>
                      <span>via {e.agent_name}</span>
                      <span>{new Date(e.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {e.status === 'pending' && (
                      <button onClick={() => updateStatus(e.id, 'in_progress')}
                        className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium">
                        Take over
                      </button>
                    )}
                    {e.status === 'in_progress' && (
                      <button onClick={() => updateStatus(e.id, 'resolved')}
                        className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
                        Resolve
                      </button>
                    )}
                  </div>
                </div>

                {e.context_summary && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-600">
                    <span className="font-medium text-gray-700">Context: </span>{e.context_summary}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
