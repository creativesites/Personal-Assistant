'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { RefObject } from 'react'
import {
  Brain, X, RefreshCw, Edit3, Copy, ChevronRight, Calendar,
  Bell, CheckCircle, AlertTriangle, AlertCircle,
  TrendingUp, TrendingDown, Activity, MessageCircle, MapPin,
  StickyNote, Lightbulb, Heart, Target, BarChart2, UserCheck,
  FileText, Download, Send, Sparkles, Zap, Search,
  Tag, Mail, Building2, Briefcase, History,
} from 'lucide-react'
import type {
  Contact, ContactDetail, Conversation, ConvContext, Message,
  Suggestion, InternalNote, ContactPromise,
} from '../_types/inbox'
import { TONE_STYLE, MOCK_ACTIONS } from '../_lib/constants'
import { formatTime } from '../_lib/utils'
import { ScoreRing } from './score-ring'
import { ProactiveCard } from './proactive-card'
import { DocumentSuggestionCard } from './document-suggestion-card'
import { InlineAICard, type AIInsight } from './inline-ai-card'
import { ChatFormatter, type ParsedAction } from '@/components/ui/chat-formatter'
import { ActionBundlesSection } from './action-bundle-card'

export type AITab = 'overview' | 'memory' | 'activity' | 'chat' | 'files'

// Advisor Companion Plan Phase 2 (docs/ADVISOR_COMPANION_PLAN.md §3.1/§3.3/
// §7.1) — the evidence/my-read/alternative-read/what-I'd-do structure,
// only populated for analysis-flavored questions ("what did they mean?",
// "analyze this chat").
interface ChatAnalysis {
  evidence: { label: string; text: string }[]
  myRead: string | null
  alternativeRead: string | null
  whatIWouldDo: string | null
}

// Advisor Companion Plan Phase 3 (docs/ADVISOR_COMPANION_PLAN.md §4.3/§5.3/
// §7.4) — a drafted send that's been turned into a durable, approvable
// action_request instead of just text in the chat response.
interface ActionRequest {
  id: string
  actionType: string
  status: 'proposed' | 'approved' | 'executing' | 'completed' | 'failed' | 'cancelled'
  payload: { conversationId: string; contactId: string; text: string }
  riskLevel: 'low' | 'medium' | 'high'
}

interface ChatMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  isDraft?: boolean
  draftText?: string
  isSuccess?: boolean
  timestamp: Date
  analysis?: ChatAnalysis | null
  mood?: string | null
  actionRequest?: ActionRequest | null
}

interface UpdateAction {
  label: string
  field: string
  type: 'number' | 'text' | 'select'
  icon: React.ElementType
  placeholder?: string
  options?: { value: string; label: string }[]
}

const CHAT_CHIPS = [
  { label: 'Summarize', icon: FileText, question: 'Summarize this conversation concisely. What are the key points, current status, and next steps?' },
  { label: 'Draft reply', icon: Edit3, question: 'Draft a natural WhatsApp follow-up message I can send to continue this conversation. Return ONLY the message text, starting with "You: ".', isDraft: true },
  { label: 'Buying intent', icon: TrendingUp, question: 'What buying signals or purchase intent can you detect from this conversation? Be specific.' },
  { label: 'Promises made', icon: CheckCircle, question: 'What promises or commitments were made by either party in this conversation?' },
  { label: 'Best approach', icon: Sparkles, question: 'What is the best approach to reply to this person right now? Consider their tone, needs, and history. Provide a suggested response starting with "You: ".' },
  { label: 'Sentiment', icon: Heart, question: 'What is the overall sentiment and emotional state of this contact? Has it changed over the conversation?' },
]

const UPDATE_ACTIONS: UpdateAction[] = [
  { label: 'Lead score', field: 'leadScore', type: 'number', icon: TrendingUp, placeholder: '0–100' },
  { label: 'Company', field: 'company', type: 'text', icon: Building2, placeholder: 'Company name' },
  { label: 'Job title', field: 'jobTitle', type: 'text', icon: Briefcase, placeholder: 'Job title' },
  { label: 'Email', field: 'email', type: 'text', icon: Mail, placeholder: 'email@example.com' },
  { label: 'Stage', field: 'pipelineStage', type: 'select', icon: Target, options: [
    { value: 'lead', label: 'Lead' },
    { value: 'prospect', label: 'Prospect' },
    { value: 'qualified', label: 'Qualified' },
    { value: 'proposal', label: 'Proposal' },
    { value: 'negotiation', label: 'Negotiation' },
    { value: 'closed_won', label: 'Closed Won' },
    { value: 'closed_lost', label: 'Closed Lost' },
  ]},
  { label: 'Status', field: 'customerStatus', type: 'select', icon: Tag, options: [
    { value: 'potential', label: 'Potential' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'vip', label: 'VIP' },
    { value: 'churned', label: 'Churned' },
  ]},
]

const SEND_COMMANDS = new Set([
  'send', 'send it', 'send that', 'send the message', 'send the response',
  'ok send', 'yes send', 'go ahead', 'go ahead and send', 'do it', 'yes do it',
  'send it out', 'send now', 'ok go',
])

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

function detectDraft(content: string): string | null {
  // Pattern: "You: <text>" at start of line or whole response
  const youMatch = content.match(/(?:^|\n)You:\s*["']?([^\n]{10,})["']?\s*$/m)
  if (youMatch) return youMatch[1].trim().replace(/^["']|["']$/g, '').trim()

  // Pattern: respond/reply/say with: "..."
  const withMatch = content.match(/(?:respond|reply|say|send)\s+(?:with|something like)?:?\s*["']([^"']{10,})["']/i)
  if (withMatch) return withMatch[1].trim()

  // Pattern: "Here's what you could say: ..."
  const hereMatch = content.match(/here'?s?\s+(?:what\s+you\s+could\s+(?:say|write|send)|a\s+(?:draft|message|response)):\s*["']?([^"'\n]{10,})/i)
  if (hereMatch) {
    const candidate = hereMatch[1].trim().replace(/^["']|["']$/g, '').trim()
    if (candidate.length > 10) return candidate
  }

  return null
}

export interface IntelPanelProps {
  contact: Contact | null
  contactDetail: ContactDetail | null
  selectedConv: Conversation | null
  contextData: ConvContext | null
  contextLoading: boolean
  suggestions: Suggestion[]
  regenerating: boolean
  actionLoading: string | null
  mode: string
  notes: InternalNote[]
  newNote: string
  editingSuggId: string | null
  editedText: string
  aiTab: AITab
  messages: Message[]
  noteRef: RefObject<HTMLTextAreaElement | null>
  token?: string | null
  analysing?: boolean
  bundleRefreshTick?: number
  onTabChange: (t: AITab) => void
  onApprove: (id: string, custom?: string) => void
  onDismiss: (id: string) => void
  onRegenerate: () => void
  onSetDraft: (text: string) => void
  onAddNote: () => void
  onNoteChange: (v: string) => void
  onEditSugg: (id: string | null) => void
  onEditedTextChange: (v: string) => void
  onClose: () => void
  draftFocus: () => void
  promises: ContactPromise[]
  onApproveProactive: (id: string) => void
  onSnoozeProactive: (id: string) => void
  onAnalyseFull?: () => void
  onSendDirect?: (text: string) => Promise<void>
}

export function IntelPanel({
  contact, contactDetail, selectedConv, contextData, contextLoading,
  suggestions, regenerating, actionLoading, mode, notes, newNote,
  editingSuggId, editedText, aiTab, messages, noteRef, token, analysing,
  bundleRefreshTick,
  onTabChange, onApprove, onDismiss, onRegenerate, onSetDraft,
  onAddNote, onNoteChange, onEditSugg, onEditedTextChange, onClose, draftFocus,
  promises, onApproveProactive, onSnoozeProactive, onAnalyseFull, onSendDirect,
}: IntelPanelProps) {
  const TABS: { id: AITab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'memory',   label: 'Memory' },
    { id: 'activity', label: 'Activity' },
    { id: 'chat',     label: 'Chat' },
    { id: 'files',    label: 'Files' },
  ]

  const healthScore = contactDetail?.relationship?.healthScore ?? selectedConv?.healthScore ?? 0

  const insights: AIInsight[] = []
  if (contextData?.buyingSignals?.length) {
    insights.push({ type: 'opportunity', text: contextData.buyingSignals[0] })
  }
  if (contextData?.dominantSentiment === 'frustrated' || contextData?.dominantSentiment === 'angry') {
    insights.push({ type: 'alert', text: `Sentiment is ${contextData.dominantSentiment} — consider an empathetic response` })
  }
  if (contextData?.intents?.length) {
    insights.push({ type: 'entity', text: `Detected intent: ${contextData.intents.slice(0,2).join(', ').replace(/_/g, ' ')}` })
  }

  const mockFiles = [
    { name: 'Invoice_March.pdf', size: '142 KB', date: '2 months ago' },
    { name: 'Product_Catalogue.pdf', size: '3.2 MB', date: '3 weeks ago' },
  ]

  // ── Chat tab state ──────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSessionId, setChatSessionId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [lastDraftText, setLastDraftText] = useState<string | null>(null)
  const [actioning, setActioning] = useState(false)
  const [activeUpdateForm, setActiveUpdateForm] = useState<UpdateAction | null>(null)
  const [updateInputValue, setUpdateInputValue] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Load persisted history when a conversation is selected
  const loadChatHistory = useCallback(async (convId: string) => {
    if (!token) return
    setHistoryLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/conversations/${convId}/ask/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json() as {
          messages: Array<{
            id: string; role: string; content: string; created_at: string
            metadata?: { analysis?: ChatAnalysis | null; assistantState?: { mood?: string }; actionRequestId?: string } | null
          }>
          sessionId: string | null
        }
        if (data.sessionId) setChatSessionId(data.sessionId)

        // Reconstruct pending action approval cards on reload — only
        // proposed/approved actions matter here (completed/cancelled ones
        // don't need a card anymore).
        let actionsById = new Map<string, ActionRequest>()
        if (data.sessionId) {
          try {
            const actionsRes = await fetch(`${API_URL}/api/advisor/actions?sessionId=${data.sessionId}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (actionsRes.ok) {
              const actionsData = await actionsRes.json() as { actions: ActionRequest[] }
              actionsById = new Map(actionsData.actions.map(a => [a.id, a]))
            }
          } catch { /* silent — approval cards just won't reappear on reload */ }
        }

        if (data.messages.length > 0) {
          setChatMessages(data.messages.map(m => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: new Date(m.created_at),
            analysis: m.metadata?.analysis ?? null,
            mood: m.metadata?.assistantState?.mood ?? null,
            actionRequest: m.metadata?.actionRequestId ? actionsById.get(m.metadata.actionRequestId) ?? null : null,
          })))
        }
      }
    } catch { /* silent — history is optional */ }
    finally { setHistoryLoading(false) }
  }, [token])

  useEffect(() => {
    setChatMessages([])
    setChatInput('')
    setChatSessionId(null)
    setLastDraftText(null)
    setActiveUpdateForm(null)
    if (selectedConv?.id) loadChatHistory(selectedConv.id)
  }, [selectedConv?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (aiTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, aiTab, activeUpdateForm])

  const addSystemMsg = (content: string, extra?: Partial<ChatMsg>) => {
    setChatMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'assistant',
      content,
      timestamp: new Date(),
      ...extra,
    }])
  }

  const handleSendNow = async (text: string) => {
    if (!onSendDirect) return
    setActioning(true)
    try {
      await onSendDirect(text)
      addSystemMsg(`✅ Sent to ${contact?.name?.split(' ')[0] ?? 'contact'}`, { isSuccess: true })
      setLastDraftText(null)
    } catch {
      addSystemMsg('Failed to send — please use the reply box below.')
    } finally {
      setActioning(false)
    }
  }

  // Advisor Companion Plan Phase 3 (§5.3/§7.4/§8.1) — approval is always
  // required for a proposed send; risk_level only decides whether the
  // "want to sleep on it?" prompt shows, it never blocks the Send button.
  const handleActionApprove = async (msgId: string, action: ActionRequest) => {
    if (!token) return
    setActioning(true)
    try {
      const approveRes = await fetch(`${API_URL}/api/advisor/actions/${action.id}/approve`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (!approveRes.ok) throw new Error('approve failed')
      const executeRes = await fetch(`${API_URL}/api/advisor/actions/${action.id}/execute`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      const data = await executeRes.json() as { action?: ActionRequest }
      const status = executeRes.ok ? 'completed' : 'failed'
      setChatMessages(prev => prev.map(m => m.id === msgId
        ? { ...m, actionRequest: m.actionRequest ? { ...m.actionRequest, status: data.action?.status ?? status } : m.actionRequest }
        : m))
      if (executeRes.ok) {
        addSystemMsg(`✅ Sent to ${contact?.name?.split(' ')[0] ?? 'contact'}`, { isSuccess: true })
      } else {
        addSystemMsg('Failed to send — please try again from the reply box below.')
      }
    } catch {
      addSystemMsg('Failed to send — please try again from the reply box below.')
    } finally {
      setActioning(false)
    }
  }

  const handleActionCancel = async (msgId: string, action: ActionRequest) => {
    if (!token) return
    setChatMessages(prev => prev.map(m => m.id === msgId
      ? { ...m, actionRequest: m.actionRequest ? { ...m.actionRequest, status: 'cancelled' } : m.actionRequest }
      : m))
    try {
      await fetch(`${API_URL}/api/advisor/actions/${action.id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
    } catch { /* already reflected optimistically */ }
  }

  const handleUpdateChip = (action: UpdateAction) => {
    setChatMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Update ${action.label}`,
      timestamp: new Date(),
    }])
    setActiveUpdateForm(action)
    setUpdateInputValue(action.type === 'select' ? (action.options?.[0]?.value ?? '') : '')
  }

  const handleUpdateSubmit = async () => {
    if (!activeUpdateForm || !contact?.id || !token) return
    const { field, label, type } = activeUpdateForm
    const value = updateInputValue.trim()
    if (!value) return

    setActioning(true)
    try {
      const updateBody: Record<string, unknown> = {}
      updateBody[field] = type === 'number' ? parseInt(value, 10) : value

      const res = await fetch(`${API_URL}/api/contacts/${contact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updateBody),
      })

      if (res.ok) {
        const displayVal = type === 'select'
          ? activeUpdateForm.options?.find(o => o.value === value)?.label ?? value
          : value
        addSystemMsg(`✅ ${label} updated to "${displayVal}" for ${contact.name}`, { isSuccess: true })
        setActiveUpdateForm(null)
        setUpdateInputValue('')
      } else {
        addSystemMsg(`Failed to update ${label}. The field may not be supported.`)
      }
    } catch {
      addSystemMsg(`Failed to update ${label}. Please check your connection.`)
    } finally {
      setActioning(false)
    }
  }

  // Handle AI-embedded CRM action tags (lead score, pipeline stage, etc.)
  const handleChatAction = async (action: ParsedAction) => {
    if (!token || !contact?.id) return
    const body: Record<string, unknown> = {}
    let url = `${API_URL}/api/contacts/${contact.id}`
    let method = 'PATCH'

    switch (action.type) {
      case 'lead_score':
        body.leadScore = parseInt(action.params[0], 10)
        break
      case 'pipeline_stage':
        body.pipelineStage = action.params[0]
        break
      case 'reply_draft':
        // Use the draft widget's Send button → route through onSendDirect
        if (action.params[1] && onSendDirect) {
          await onSendDirect(action.params[1])
          addSystemMsg(`✅ Message sent to ${contact.name?.split(' ')[0] ?? 'contact'}`, { isSuccess: true })
        }
        return
      case 'reminder':
        url = `${API_URL}/api/calendar/events`
        method = 'POST'
        body.title = action.params[0]
        body.eventDate = action.params[1]
        body.eventType = 'reminder'
        body.contactId = contact.id
        break
      default:
        return
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Failed: ${res.status}`)
  }

  const sendChat = async (text: string, isDraftHint = false) => {
    if (!token || !selectedConv?.id || !text.trim()) return

    const cleanText = text.trim()

    // ── Send intent detection ───────────────────────────────────────────────
    if (SEND_COMMANDS.has(cleanText.toLowerCase())) {
      if (lastDraftText && onSendDirect) {
        setChatMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: cleanText, timestamp: new Date() }])
        setChatInput('')
        await handleSendNow(lastDraftText)
        return
      } else if (!lastDraftText) {
        setChatMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: cleanText, timestamp: new Date() }])
        setChatInput('')
        addSystemMsg('No draft to send yet. Ask me to draft a reply first, then say "send" to dispatch it.')
        return
      }
    }

    const userMsg: ChatMsg = { id: crypto.randomUUID(), role: 'user', content: cleanText, timestamp: new Date() }
    setChatMessages(prev => [...prev, userMsg])
    setChatInput('')
    setChatLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/conversations/${selectedConv.id}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: cleanText, sessionId: chatSessionId }),
      })

      let answer = ''
      let analysis: ChatAnalysis | null = null
      let mood: string | null = null
      let actionRequest: ActionRequest | null = null
      if (res.ok) {
        const data = await res.json() as {
          answer?: string; sessionId?: string
          analysis?: ChatAnalysis | null
          assistantState?: { mood?: string }
          actionRequest?: ActionRequest | null
        }
        answer = data.answer ?? 'No response.'
        analysis = data.analysis ?? null
        mood = data.assistantState?.mood ?? null
        actionRequest = data.actionRequest ?? null
        // Capture session ID returned by the API
        if (data.sessionId && !chatSessionId) setChatSessionId(data.sessionId)
      } else {
        answer = 'AI service returned an error. Please try again.'
      }

      // Extract sendable draft from response
      const extracted = detectDraft(answer)
      const draftText = isDraftHint ? answer.replace(/^You:\s*/i, '').trim() : (extracted ?? undefined)

      if (draftText) setLastDraftText(draftText)

      setChatMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: answer,
        isDraft: isDraftHint,
        draftText,
        timestamp: new Date(),
        analysis,
        mood,
        actionRequest,
      }])
    } catch {
      addSystemMsg('Unable to reach AI service.')
    } finally {
      setChatLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-50 rounded-md flex items-center justify-center">
            <Brain size={13} className="text-indigo-600" />
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {contact?.name ? contact.name.split(' ')[0] : 'Intelligence'}
          </p>
        </div>
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0 px-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-2.5 text-[10px] font-semibold transition-colors ${
              aiTab === tab.id ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className={`flex-1 overflow-y-auto ${aiTab === 'chat' ? 'flex flex-col overflow-y-hidden' : ''}`}>

        {/* ── Overview ────────────────────────────────────────────────────── */}
        {aiTab === 'overview' && (
          <div className="divide-y divide-gray-50">
            {contact && token && (
              <ActionBundlesSection contactId={contact.id} token={token} refreshKey={bundleRefreshTick ?? 0} />
            )}
            {contact && (() => {
              const proactives = contactDetail?.proactiveSuggestions ?? []
              const documentSuggestion = contactDetail?.documentSuggestion ?? null
              const birthday = contactDetail?.upcomingEvents?.find(e => e.eventType === 'birthday')
              const isDormant = healthScore < 35
              const hasPromises = promises.length > 0
              if (proactives.length === 0 && !documentSuggestion && !birthday && !isDormant && !hasPromises) return null
              return (
                <div className="p-4 space-y-2.5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Reminders</p>
                  {documentSuggestion && token && (
                    <DocumentSuggestionCard contactId={contact.id} suggestion={documentSuggestion} token={token} />
                  )}
                  {proactives.map(s => (
                    <ProactiveCard key={s.id} suggestion={s}
                      onSend={(draft) => { if (draft) { onSetDraft(draft); draftFocus() } onApproveProactive(s.id) }}
                      onSnooze={() => onSnoozeProactive(s.id)} />
                  ))}
                  {birthday && (
                    <div className="rounded-xl p-3.5 bg-pink-50 border border-pink-100 flex items-start gap-2.5">
                      <div className="w-7 h-7 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Calendar size={13} className="text-pink-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-pink-900">{birthday.title}</p>
                        <p className="text-[11px] text-pink-600 mt-0.5">{birthday.eventDate}</p>
                      </div>
                    </div>
                  )}
                  {isDormant && proactives.length === 0 && (
                    <div className="rounded-xl p-3.5 bg-amber-50 border border-amber-200 flex items-start gap-2.5">
                      <TrendingDown size={13} className="text-amber-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-amber-900 mb-0.5">Relationship needs attention</p>
                        <p className="text-[11px] text-amber-700 leading-relaxed">Health score is low ({healthScore}/100) — a warm follow-up could help.</p>
                      </div>
                    </div>
                  )}
                  {hasPromises && (
                    <div className="space-y-1.5 pt-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Promises to Keep</p>
                      {promises.slice(0, 3).map((p, i) => (
                        <div key={i} className="flex items-start gap-2.5 p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                          <CheckCircle size={12} className="text-rose-400 mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-rose-900 leading-relaxed">{p.text}</p>
                            <p className="text-[10px] text-rose-400 mt-0.5">{formatTime(p.messageAt)}</p>
                          </div>
                          <button onClick={() => { onSetDraft(p.text); draftFocus() }}
                            className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-100 hover:bg-rose-200 px-2 py-1 rounded-lg flex-shrink-0 transition-colors whitespace-nowrap">
                            Send Now
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {contact && (
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <ScoreRing score={healthScore} size={64} />
                  <div className="flex-1 min-w-0 pt-1">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Relationship Health</p>
                    <p className="text-xs text-gray-700 leading-relaxed">
                      {healthScore >= 70 ? 'Strong relationship with consistent engagement.' : healthScore >= 40 ? 'Moderate — attention may improve retention.' : 'Needs nurturing — high churn risk.'}
                    </p>
                    {contextData?.requiresResponse && (
                      <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 text-red-600 border border-red-100">
                        <AlertCircle size={9} />Needs reply
                      </span>
                    )}
                  </div>
                </div>
                {insights.length > 0 && <div className="space-y-2">{insights.map((ins, i) => <InlineAICard key={i} insight={ins} />)}</div>}
              </div>
            )}

            {contextLoading && <div className="p-4 space-y-2">{[1,2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-xl animate-pulse" />)}</div>}

            {contextData?.nextAction && (
              <div className="p-4">
                <div className={`rounded-xl p-3.5 flex items-start gap-3 ${contextData.urgency === 'high' ? 'bg-amber-50 border border-amber-100' : 'bg-indigo-50 border border-indigo-100'}`}>
                  <Lightbulb size={14} className={`flex-shrink-0 mt-0.5 ${contextData.urgency === 'high' ? 'text-amber-600' : 'text-indigo-600'}`} />
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${contextData.urgency === 'high' ? 'text-amber-500' : 'text-indigo-400'}`}>Recommended Action</p>
                    <p className={`text-sm font-semibold ${contextData.urgency === 'high' ? 'text-amber-900' : 'text-indigo-900'}`}>{contextData.nextAction}</p>
                  </div>
                </div>
              </div>
            )}

            {contact && contactDetail && (
              <>
                {mode !== 'personal' && (contactDetail.company || contactDetail.jobTitle || contactDetail.pipelineStage || contactDetail.leadScore != null) && (
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Business Context</p>
                    <div className="space-y-2">
                      {contactDetail.company && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0"><BarChart2 size={11} className="text-gray-500" /></div>
                          <div><p className="text-[10px] text-gray-400">Company</p><p className="text-xs font-semibold text-gray-800">{contactDetail.company}</p></div>
                        </div>
                      )}
                      {contactDetail.jobTitle && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0"><UserCheck size={11} className="text-gray-500" /></div>
                          <div><p className="text-[10px] text-gray-400">Role</p><p className="text-xs font-semibold text-gray-800">{contactDetail.jobTitle}</p></div>
                        </div>
                      )}
                      {contactDetail.pipelineStage && (
                        <div className="flex items-center gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0"><Target size={11} className="text-gray-500" /></div>
                          <div><p className="text-[10px] text-gray-400">Deal Stage</p><p className="text-xs font-semibold text-gray-800 capitalize">{contactDetail.pipelineStage.replace(/_/g, ' ')}</p></div>
                        </div>
                      )}
                      {contactDetail.leadScore != null && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[10px] text-gray-400">Lead Score</p>
                            <span className={`text-xs font-bold tabular-nums ${contactDetail.leadScore > 70 ? 'text-indigo-600' : contactDetail.leadScore > 40 ? 'text-amber-600' : 'text-red-500'}`}>{contactDetail.leadScore}/100</span>
                          </div>
                          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${contactDetail.leadScore > 70 ? 'bg-indigo-500' : contactDetail.leadScore > 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${contactDetail.leadScore}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(contactDetail.profile?.communicationStyle || contactDetail.profile?.moodBaseline || contactDetail.profile?.currentLifeContext || contactDetail.notes) && (
                  <div className="p-4">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Personal Context</p>
                    <div className="space-y-2">
                      {(contextData?.communicationStyle ?? contactDetail.profile?.communicationStyle) && (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 flex items-start gap-2.5">
                          <MessageCircle size={12} className="text-blue-500 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] text-blue-400 font-semibold uppercase tracking-widest">Comm. Style</p>
                            <p className="text-xs font-semibold text-blue-900 capitalize leading-snug mt-0.5">{contextData?.communicationStyle ?? contactDetail.profile?.communicationStyle}</p>
                          </div>
                        </div>
                      )}
                      {contactDetail.profile?.moodBaseline && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"><Activity size={11} className="text-gray-500" /></div>
                          <div><p className="text-[10px] text-gray-400">Mood Baseline</p><p className="text-xs font-medium text-gray-800 capitalize">{contactDetail.profile.moodBaseline}</p></div>
                        </div>
                      )}
                      {contactDetail.profile?.currentLifeContext && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"><MapPin size={11} className="text-gray-500" /></div>
                          <div><p className="text-[10px] text-gray-400">Life Context</p><p className="text-xs text-gray-700 leading-relaxed">{contactDetail.profile.currentLifeContext}</p></div>
                        </div>
                      )}
                      {contactDetail.notes && (
                        <div className="flex items-start gap-2.5">
                          <div className="w-6 h-6 bg-gray-100 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"><StickyNote size={11} className="text-gray-500" /></div>
                          <div><p className="text-[10px] text-gray-400">Notes</p><p className="text-xs text-gray-700 leading-relaxed">{contactDetail.notes}</p></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {contactDetail && (() => {
              const INTEREST_KEYS = ['interest', 'hobby', 'passion', 'like', 'enjoy', 'favorite', 'favourite', 'sport', 'music', 'food', 'travel', 'fan', 'activity']
              const LIFE_EVENT_KEYS = ['job', 'career', 'work', 'moved', 'relocat', 'promotion', 'study', 'graduat', 'married', 'birth', 'family', 'health', 'launch', 'start', 'bought', 'sold']
              const interests = contactDetail.insights.filter(i => INTEREST_KEYS.some(k => i.key.toLowerCase().includes(k)))
              const lifeEvents = contactDetail.insights.filter(i => LIFE_EVENT_KEYS.some(k => i.key.toLowerCase().includes(k)))
              if (interests.length === 0 && lifeEvents.length === 0) return null
              return (
                <div className="p-4 space-y-3">
                  {interests.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Interests & Passions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {interests.map((ins, i) => (
                          <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 text-[11px] font-medium rounded-full border border-purple-100 capitalize">
                            <Heart size={9} className="flex-shrink-0" />
                            {ins.value.length > 30 ? ins.value.slice(0, 30) + '…' : ins.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {lifeEvents.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Recent Life Events</p>
                      <div className="space-y-1.5">
                        {lifeEvents.map((ins, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <p className="text-xs text-gray-700 leading-relaxed">{ins.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {mode !== 'personal' && contextData?.buyingSignals && contextData.buyingSignals.length > 0 && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Buying Signals</p>
                <div className="space-y-1.5">
                  {contextData.buyingSignals.map((signal, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <TrendingUp size={11} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-gray-700 leading-relaxed">{signal}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {mode !== 'personal' && contactDetail?.profile?.buyingBehaviour && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Buying Behaviour</p>
                <p className="text-xs text-gray-700 leading-relaxed">{contactDetail.profile.buyingBehaviour}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Memory ──────────────────────────────────────────────────────── */}
        {aiTab === 'memory' && (
          <div className="divide-y divide-gray-50">
            {contextData?.summary && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">AI Conversation Summary</p>
                <p className="text-xs text-gray-700 leading-relaxed">{contextData.summary}</p>
                {contextData.analysedAt && <p className="text-[10px] text-gray-300 mt-2">Analysed {formatTime(contextData.analysedAt)}</p>}
              </div>
            )}
            {(contextData?.personalitySummary || contactDetail?.profile?.personalitySummary) && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Personality</p>
                <p className="text-xs text-gray-700 leading-relaxed">{contextData?.personalitySummary ?? contactDetail?.profile?.personalitySummary}</p>
                {(contextData?.communicationStyle ?? contactDetail?.profile?.communicationStyle) && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <MessageCircle size={11} className="text-gray-400" />
                    <p className="text-xs text-gray-500">{contextData?.communicationStyle ?? contactDetail?.profile?.communicationStyle}</p>
                  </div>
                )}
              </div>
            )}
            {contextData && (contextData.topTopics.length > 0 || contextData.intents.length > 0) && (
              <div className="p-4">
                {contextData.intents.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Intent Signals</p>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {contextData.intents.map(intent => (
                        <span key={intent} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-medium rounded-full border border-blue-100 capitalize">{intent.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </>
                )}
                {contextData.topTopics.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Key Topics</p>
                    <div className="flex flex-wrap gap-1.5">
                      {contextData.topTopics.map(topic => (
                        <span key={topic} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[11px] font-medium rounded-full capitalize">{topic.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {contextData?.insights && contextData.insights.length > 0 && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">AI Memory</p>
                <div className="space-y-2">
                  {contextData.insights.map((ins, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-300 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-700 leading-relaxed">{ins.value}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5 capitalize">{ins.key?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="p-4 space-y-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Private Notes</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <textarea ref={noteRef} value={newNote} onChange={e => onNoteChange(e.target.value)}
                  placeholder="Add a private note — only your team sees this…"
                  rows={2} className="w-full px-3 py-2.5 text-xs text-gray-700 resize-none focus:outline-none border-b border-gray-100 placeholder-gray-400" />
                <div className="flex justify-end px-3 py-2 bg-gray-50">
                  <button onClick={onAddNote} disabled={!newNote.trim()}
                    className="text-xs font-semibold px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                    Save
                  </button>
                </div>
              </div>
              {notes.length === 0 ? (
                <div className="text-center py-4"><StickyNote size={22} className="text-gray-300 mx-auto mb-1.5" /><p className="text-xs text-gray-400">No notes yet</p></div>
              ) : notes.map(n => (
                <div key={n.id} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                  <p className="text-xs text-gray-800 leading-relaxed">{n.text}</p>
                  <p className="text-[10px] text-amber-600 mt-1.5">{n.author} · {formatTime(n.createdAt)}</p>
                </div>
              ))}
            </div>
            {!contextData && !contextLoading && (
              <div className="px-4 py-8 text-center">
                <Brain size={28} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-600 mb-1">No memory yet</p>
                <p className="text-xs text-gray-400">AI context builds as conversation progresses.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Activity ────────────────────────────────────────────────────── */}
        {aiTab === 'activity' && (
          <div className="divide-y divide-gray-50">
            {onAnalyseFull && (
              <div className="p-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Search size={14} className="text-indigo-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-indigo-900 mb-0.5">Deep Analysis</p>
                      <p className="text-[11px] text-indigo-600 leading-relaxed mb-2.5">Read the entire conversation history and populate contact profiles, buying signals, and AI memory.</p>
                      <button onClick={onAnalyseFull} disabled={analysing}
                        className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                        {analysing ? <><RefreshCw size={10} className="animate-spin" />Analysing…</> : <><Zap size={10} />Analyse Full Chat</>}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(suggestions.length > 0 || regenerating) && (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI Reply Suggestions</p>
                  <button onClick={onRegenerate} disabled={regenerating} className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold disabled:opacity-50">
                    <RefreshCw size={10} className={regenerating ? 'animate-spin' : ''} /> Regenerate
                  </button>
                </div>
                {regenerating ? (
                  <div className="flex flex-col items-center py-6 gap-2">
                    <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    <p className="text-xs text-gray-400">Generating…</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {suggestions.map(s => (
                      <div key={s.id} className={`rounded-xl p-3 border ${TONE_STYLE[s.tone] ?? 'bg-gray-50 border-gray-100 text-gray-800'}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wide">{s.tone}</span>
                          <div className="flex items-center gap-1">
                            {s.confidence != null && <span className="text-[10px] font-semibold opacity-60">{s.confidence}%</span>}
                            <button onClick={() => { onEditSugg(s.id); onEditedTextChange(s.text) }} className="p-1 opacity-50 hover:opacity-100 transition-opacity"><Edit3 size={10} /></button>
                            <button onClick={() => navigator.clipboard.writeText(s.text)} className="p-1 opacity-50 hover:opacity-100 transition-opacity"><Copy size={10} /></button>
                          </div>
                        </div>
                        {editingSuggId === s.id ? (
                          <textarea autoFocus rows={3} value={editedText} onChange={e => onEditedTextChange(e.target.value)}
                            className="w-full text-xs leading-relaxed bg-white/60 border border-current/20 rounded-lg p-2 resize-none focus:outline-none mb-2" />
                        ) : <p className="text-xs leading-relaxed mb-1">{s.text}</p>}
                        {editingSuggId !== s.id && s.reasoning && <p className="text-[10px] opacity-50 leading-relaxed mb-2">{s.reasoning}</p>}
                        <div className="flex gap-1.5 mt-2">
                          <button onClick={() => onApprove(s.id, editingSuggId === s.id ? editedText : undefined)}
                            disabled={actionLoading === s.id}
                            className="flex-1 text-[11px] font-bold py-1.5 bg-current/10 hover:bg-current/20 rounded-lg disabled:opacity-50 transition-colors">
                            {editingSuggId === s.id ? 'Send edited' : 'Send'}
                          </button>
                          {editingSuggId !== s.id && (
                            <button onClick={() => { onSetDraft(s.text); draftFocus() }}
                              className="flex-1 text-[11px] font-semibold py-1.5 bg-white/50 hover:bg-white/80 border border-current/10 rounded-lg transition-colors">Edit</button>
                          )}
                          {editingSuggId === s.id && (
                            <button onClick={() => onEditSugg(null)} className="px-3 text-[11px] py-1.5 bg-white/30 border border-current/10 rounded-lg">Cancel</button>
                          )}
                          <button onClick={() => onDismiss(s.id)} disabled={actionLoading === s.id} className="px-2 text-[11px] py-1.5 opacity-40 hover:opacity-70 transition-opacity"><X size={12} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {mode !== 'personal' && (
              <div className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Suggested Actions</p>
                <div className="space-y-1">
                  {MOCK_ACTIONS.map(a => {
                    const Icon = a.icon
                    return (
                      <button key={a.label} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-gray-700 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-lg transition-colors text-left group">
                        <Icon size={12} className="text-gray-400 group-hover:text-indigo-500 flex-shrink-0" />
                        {a.label}
                        <ChevronRight size={11} className="ml-auto text-gray-300 group-hover:text-indigo-400" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Timeline</p>
              {contactDetail ? (
                (() => {
                  const hasUpcoming = (contactDetail.upcomingEvents?.length ?? 0) > 0
                  const hasHistory = (contactDetail.healthHistory?.length ?? 0) > 0
                  if (!hasUpcoming && !hasHistory) return <div className="text-center py-6"><Calendar size={22} className="text-gray-300 mx-auto mb-2" /><p className="text-xs text-gray-400">No timeline events yet</p></div>
                  return (
                    <div className="relative">
                      <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-100" />
                      <div className="space-y-4">
                        {contactDetail.upcomingEvents?.map(ev => {
                          const EICONS: Record<string, React.ElementType> = { birthday: Calendar, anniversary: Bell, meeting: Calendar, deadline: AlertTriangle, appointment: Calendar }
                          const EIcon = EICONS[ev.eventType] ?? Calendar
                          return (
                            <div key={ev.id} className="flex items-start gap-3">
                              <div className="w-6 h-6 rounded-full bg-indigo-50 border-2 border-indigo-200 flex items-center justify-center flex-shrink-0 z-10"><EIcon size={10} className="text-indigo-500" /></div>
                              <div className="pt-0.5">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-semibold text-gray-700">{ev.title}</p>
                                  {ev.isRecurring && <span className="text-[9px] text-indigo-500 bg-indigo-50 px-1 py-0.5 rounded-full">recurring</span>}
                                </div>
                                <p className="text-[10px] text-indigo-500">{ev.eventDate}</p>
                              </div>
                            </div>
                          )
                        })}
                        {contactDetail.healthHistory?.map((h, i) => (
                          <div key={i} className="flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 ${h.previousScore != null && h.score > h.previousScore ? 'bg-emerald-50 border-emerald-200' : h.previousScore != null && h.score < h.previousScore ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                              {h.previousScore != null && h.score > h.previousScore ? <TrendingUp size={10} className="text-emerald-500" /> : h.previousScore != null && h.score < h.previousScore ? <TrendingDown size={10} className="text-red-400" /> : <Activity size={10} className="text-gray-400" />}
                            </div>
                            <div className="pt-0.5">
                              <p className="text-xs font-semibold text-gray-700">Health: {h.score}/100{h.previousScore != null && h.previousScore !== h.score && <span className={`ml-1 text-[10px] ${h.score > h.previousScore ? 'text-emerald-500' : 'text-red-400'}`}>{h.score > h.previousScore ? `+${h.score - h.previousScore}` : `${h.score - h.previousScore}`}</span>}</p>
                              {h.changeReason && <p className="text-[10px] text-gray-500 leading-relaxed">{h.changeReason}</p>}
                              <p className="text-[10px] text-gray-400 mt-0.5">{formatTime(h.recordedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()
              ) : (
                <div className="relative">
                  <div className="absolute left-[11px] top-3 bottom-3 w-px bg-gray-100" />
                  <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="flex items-start gap-3"><div className="w-6 h-6 rounded-full bg-gray-100 animate-pulse flex-shrink-0" /><div className="flex-1 pt-1"><div className="h-3 bg-gray-100 rounded animate-pulse w-2/3 mb-1" /><div className="h-2.5 bg-gray-100 rounded animate-pulse w-1/3" /></div></div>)}</div>
                </div>
              )}
            </div>

            {messages.length > 0 && (() => {
              const sentCount = messages.filter(m => m.senderType === 'user').length
              const recvCount = messages.filter(m => m.senderType === 'contact').length
              const total = messages.length
              const sentPct = Math.round((sentCount / total) * 100)
              const recvPct = 100 - sentPct
              let totalGapMs = 0; let gapCount = 0
              for (let i = 1; i < messages.length; i++) {
                if (messages[i].senderType === 'user' && messages[i - 1].senderType === 'contact') {
                  totalGapMs += new Date(messages[i].timestamp).getTime() - new Date(messages[i - 1].timestamp).getTime()
                  gapCount++
                }
              }
              const avgResponseMin = gapCount > 0 ? Math.round(totalGapMs / gapCount / 60000) : null
              return (
                <div className="p-4 border-t border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Conversation Stats</p>
                  <div className="space-y-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1"><span className="text-gray-500">You sent</span><span className="font-semibold text-gray-700">{sentCount} msg ({sentPct}%)</span></div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full transition-all" style={{ width: `${sentPct}%` }} /></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-1"><span className="text-gray-500">They sent</span><span className="font-semibold text-gray-700">{recvCount} msg ({recvPct}%)</span></div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${recvPct}%` }} /></div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] text-gray-400">{total} messages total</span>
                      {avgResponseMin !== null && <span className="text-[10px] text-gray-400">Avg reply <span className="font-semibold text-gray-600">{avgResponseMin < 60 ? `${avgResponseMin}m` : `${Math.round(avgResponseMin / 60)}h`}</span></span>}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ── Chat ────────────────────────────────────────────────────────── */}
        {aiTab === 'chat' && (
          <div className="flex flex-col flex-1 min-h-0 h-full">
            {/* Chips header */}
            <div className="p-2.5 border-b border-gray-100 flex-shrink-0 space-y-2">
              {/* Q&A chips */}
              <div className="flex flex-wrap gap-1.5">
                {CHAT_CHIPS.map(chip => (
                  <button key={chip.label} onClick={() => sendChat(chip.question, chip.isDraft)}
                    disabled={chatLoading || !selectedConv}
                    className="flex items-center gap-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-full border border-indigo-100 transition-colors disabled:opacity-40">
                    <chip.icon size={9} />
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Contact update chips — only when a contact is loaded */}
              {contact && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Update:</span>
                  {UPDATE_ACTIONS.map(action => (
                    <button key={action.field} onClick={() => handleUpdateChip(action)}
                      disabled={chatLoading || actioning || !token}
                      className="flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-[10px] font-semibold rounded-full border border-gray-200 transition-colors disabled:opacity-40">
                      <action.icon size={9} />
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Messages scroll area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
              {historyLoading ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                  <p className="text-[11px] text-gray-400">Loading history…</p>
                </div>
              ) : chatMessages.length === 0 && !activeUpdateForm ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-4 py-10">
                  <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mb-3">
                    <Sparkles size={22} className="text-indigo-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 mb-1">AI Chat</p>
                  <p className="text-xs text-gray-400 leading-relaxed max-w-[200px]">
                    Ask anything about this conversation. Zuri remembers every chat.
                    Type <span className="font-bold text-gray-600">"send"</span> to dispatch a drafted reply directly.
                  </p>
                  {!selectedConv && <p className="text-[11px] text-amber-600 mt-3 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-100">Select a conversation first</p>}
                </div>
              ) : chatMessages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'assistant' && (
                    <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                      <Brain size={10} className="text-indigo-600" />
                    </div>
                  )}
                  <div className={`max-w-[87%] flex flex-col gap-1.5 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {msg.role === 'user' ? (
                      <div className="rounded-2xl rounded-br-sm px-3 py-2 text-xs leading-relaxed bg-indigo-600 text-white">
                        {msg.content}
                      </div>
                    ) : msg.isSuccess ? (
                      <div className="rounded-2xl rounded-bl-sm px-3 py-2 text-xs leading-relaxed bg-emerald-50 text-emerald-800 border border-emerald-100">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="rounded-2xl rounded-bl-sm px-3 py-2.5 bg-gray-50 border border-gray-100 w-full">
                        <ChatFormatter
                          content={msg.content}
                          theme="light"
                          contactName={contact?.name?.split(' ')[0]}
                          onAction={handleChatAction}
                          onSetDraft={onSetDraft}
                          draftFocus={draftFocus}
                        />
                      </div>
                    )}

                    {/* Evidence / my read / alternative read / what I'd do — Advisor Companion Plan Phase 2 (§3.1/§3.3/§7.1) */}
                    {msg.role === 'assistant' && msg.analysis && (msg.analysis.evidence?.length > 0 || msg.analysis.myRead) && (
                      <div className="w-full bg-indigo-50/60 border border-indigo-100 rounded-xl p-2.5 space-y-2">
                        {msg.analysis.evidence?.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-500 mb-1">What I can see</p>
                            <ul className="space-y-1">
                              {msg.analysis.evidence.map((e, i) => (
                                <li key={i} className="text-[11px] text-gray-700 leading-snug">
                                  <span className="font-semibold text-gray-800">{e.label}:</span> {e.text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {msg.analysis.myRead && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-500 mb-0.5">My read</p>
                            <p className="text-[11px] text-gray-700 leading-snug">{msg.analysis.myRead}</p>
                          </div>
                        )}
                        {msg.analysis.alternativeRead && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-500 mb-0.5">Or, alternatively</p>
                            <p className="text-[11px] text-gray-700 leading-snug">{msg.analysis.alternativeRead}</p>
                          </div>
                        )}
                        {msg.analysis.whatIWouldDo && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-wide text-indigo-500 mb-0.5">What I'd do</p>
                            <p className="text-[11px] text-gray-700 leading-snug">{msg.analysis.whatIWouldDo}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Action approval card — Advisor Companion Plan Phase 3 (§4.3/§5.3/§7.4/§8.1) */}
                    {msg.role === 'assistant' && msg.actionRequest && (
                      <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <Send size={8} className="text-white" />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700">
                            Send to {contact?.name?.split(' ')[0] ?? 'contact'}
                          </span>
                          {msg.actionRequest.status !== 'proposed' && msg.actionRequest.status !== 'approved' && (
                            <span className="ml-auto text-[9px] font-bold uppercase tracking-wide text-gray-500">
                              {msg.actionRequest.status}
                            </span>
                          )}
                        </div>
                        <div className="bg-white rounded-lg px-2.5 py-2 border border-emerald-100">
                          <p className="text-[11px] text-gray-800 leading-relaxed">{msg.actionRequest.payload.text}</p>
                        </div>
                        {(msg.actionRequest.status === 'proposed' || msg.actionRequest.status === 'approved') && msg.actionRequest.riskLevel === 'high' && (
                          <div className="flex items-start gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                            <AlertTriangle size={11} className="text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-800 leading-snug">
                              This one's higher-stakes — want to sleep on it? You can still send now if you're sure.
                            </p>
                          </div>
                        )}
                        {(msg.actionRequest.status === 'proposed' || msg.actionRequest.status === 'approved') && (
                          <div className="flex gap-1.5">
                            <button onClick={() => handleActionApprove(msg.id, msg.actionRequest!)} disabled={actioning}
                              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                              <Send size={9} />Send Now
                            </button>
                            <button onClick={() => { onSetDraft(msg.actionRequest!.payload.text); draftFocus() }}
                              className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 bg-white text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                              <Edit3 size={9} />Edit
                            </button>
                            <button onClick={() => handleActionCancel(msg.id, msg.actionRequest!)} disabled={actioning}
                              className="text-[10px] font-semibold px-2.5 py-1.5 text-gray-500 hover:text-gray-700 rounded-lg disabled:opacity-50 transition-colors">
                              Cancel
                            </button>
                          </div>
                        )}
                        {msg.actionRequest.status === 'completed' && (
                          <p className="text-[10px] text-emerald-700 font-semibold">✅ Sent</p>
                        )}
                        {(msg.actionRequest.status === 'failed' || msg.actionRequest.status === 'cancelled') && (
                          <p className="text-[10px] text-gray-500 font-semibold capitalize">{msg.actionRequest.status}</p>
                        )}
                      </div>
                    )}

                    {/* Legacy draft extracted from pre-formatter messages */}
                    {msg.role === 'assistant' && msg.draftText && !msg.content.includes('[ACTION: reply_draft') && (
                      <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 space-y-2">
                        <div className="flex items-center gap-1.5 mb-1">
                          <div className="w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <MessageCircle size={8} className="text-white" />
                          </div>
                          <span className="text-[10px] font-bold text-emerald-700">
                            Draft for {contact?.name?.split(' ')[0] ?? 'contact'}
                          </span>
                        </div>
                        <div className="bg-white rounded-lg px-2.5 py-2 border border-emerald-100">
                          <p className="text-[11px] text-gray-800 leading-relaxed">{msg.draftText}</p>
                        </div>
                        <div className="flex gap-1.5">
                          {onSendDirect && (
                            <button onClick={() => handleSendNow(msg.draftText!)} disabled={actioning}
                              className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                              <Send size={9} />Send Now
                            </button>
                          )}
                          <button onClick={() => { onSetDraft(msg.draftText!); draftFocus() }}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1.5 bg-white text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors">
                            <Edit3 size={9} />Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Active update form — shown as an AI "bubble" */}
              {activeUpdateForm && (
                <div className="flex justify-start">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                    <Brain size={10} className="text-indigo-600" />
                  </div>
                  <div className="max-w-[85%] bg-blue-50 border border-blue-100 rounded-2xl rounded-bl-sm p-3 space-y-2.5">
                    <p className="text-[11px] font-semibold text-blue-800">
                      Set {activeUpdateForm.label} for {contact?.name}
                    </p>

                    {activeUpdateForm.type === 'select' ? (
                      <select value={updateInputValue} onChange={e => setUpdateInputValue(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/20 bg-white text-gray-700">
                        {activeUpdateForm.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    ) : (
                      <input
                        type={activeUpdateForm.type}
                        value={updateInputValue}
                        onChange={e => setUpdateInputValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && updateInputValue.trim() && handleUpdateSubmit()}
                        placeholder={activeUpdateForm.placeholder ?? ''}
                        min={activeUpdateForm.type === 'number' ? 0 : undefined}
                        max={activeUpdateForm.field === 'leadScore' ? 100 : undefined}
                        autoFocus
                        className="w-full px-2.5 py-1.5 text-xs border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400/20 bg-white placeholder-gray-400"
                      />
                    )}

                    <div className="flex gap-1.5">
                      <button onClick={handleUpdateSubmit}
                        disabled={!updateInputValue.toString().trim() || actioning}
                        className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 transition-colors">
                        {actioning ? <RefreshCw size={9} className="animate-spin" /> : <CheckCircle size={9} />}
                        Save
                      </button>
                      <button onClick={() => { setActiveUpdateForm(null); setUpdateInputValue('') }}
                        className="text-[10px] font-medium px-2.5 py-1.5 text-blue-600 hover:text-blue-700 border border-blue-200 bg-white rounded-lg hover:bg-blue-50 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {chatLoading && (
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Brain size={10} className="text-indigo-600" />
                  </div>
                  <div className="flex gap-1 px-3 py-2 bg-gray-100 rounded-2xl rounded-bl-sm">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '120ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '240ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-100 flex-shrink-0">
              {lastDraftText && (
                <div className="mb-2 px-2 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center justify-between">
                  <span className="text-[10px] text-emerald-700 font-medium truncate flex-1 mr-2">
                    Draft ready — type "send" to dispatch
                  </span>
                  <button onClick={() => setLastDraftText(null)} className="text-emerald-400 hover:text-emerald-600 flex-shrink-0">
                    <X size={11} />
                  </button>
                </div>
              )}
              <div className="flex gap-2 items-end">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey && chatInput.trim() && !chatLoading) {
                      e.preventDefault()
                      sendChat(chatInput)
                    }
                  }}
                  placeholder={lastDraftText ? 'Type "send" to dispatch, or ask another question…' : `Ask about ${contact?.name?.split(' ')[0] ?? 'this conversation'}…`}
                  disabled={chatLoading || !selectedConv || actioning}
                  className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 placeholder-gray-400 disabled:bg-gray-50"
                />
                <button onClick={() => chatInput.trim() && sendChat(chatInput)}
                  disabled={chatLoading || !chatInput.trim() || !selectedConv || actioning}
                  className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-40 transition-colors flex-shrink-0">
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Files ───────────────────────────────────────────────────────── */}
        {aiTab === 'files' && (
          <div className="p-4 space-y-2">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Shared Files</p>
            {mockFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-gray-100 transition-colors cursor-pointer">
                <div className="w-8 h-8 bg-white rounded-lg border border-gray-200 flex items-center justify-center flex-shrink-0"><FileText size={14} className="text-indigo-500" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{f.name}</p>
                  <p className="text-[10px] text-gray-400">{f.size} · {f.date}</p>
                </div>
                <Download size={13} className="text-gray-400 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
