'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Avatar, Badge, EmptyState, HealthBar, SkeletonListItem } from '@/components/ui'

interface Contact {
  id: string
  name: string
  avatarUrl: string | null
}

interface ContactDetail {
  id: string
  name: string
  relationship: { type: string; healthScore: number; healthTrend: string }
  profile: { personalitySummary: string; moodBaseline: string; communicationStyle?: string } | null
}

interface Conversation {
  id: string
  contact: Contact
  relationshipType: string
  healthScore: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
}

interface Message {
  id: string
  senderType: 'user' | 'contact'
  body: string | null
  timestamp: string
  pendingSuggestions: number
}

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
}

const TONE_COLORS: Record<string, string> = {
  friendly:     'bg-green-100 text-green-800',
  professional: 'bg-blue-100 text-blue-800',
  empathetic:   'bg-purple-100 text-purple-800',
  casual:       'bg-gray-100 text-gray-700',
  urgent:       'bg-amber-100 text-amber-800',
  sales:        'bg-orange-100 text-orange-800',
  firm:         'bg-slate-100 text-slate-800',
}

function formatTime(ts: string | null) {
  if (!ts) return ''
  const d = new Date(ts)
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

type MobilePane = 'list' | 'thread'

export default function InboxPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'

  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(false)
  const [mobilePane, setMobilePane] = useState<MobilePane>('list')
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [search, setSearch] = useState('')
  const selectedIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const loadConversations = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ conversations: Conversation[] }>('/api/conversations', { token })
      setConversations(data.conversations)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    loadConversations()
    const socket = getSocket(token)
    socket.on('message:new', loadConversations)
    socket.on('suggestion:ready', (payload: string) => {
      try {
        const data = JSON.parse(payload)
        if (selectedIdRef.current && token) {
          apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${data.messageId}/suggestions`, { token })
            .then(d => { setSuggestions(d.suggestions); setSelectedMsgId(data.messageId) })
        }
        loadConversations()
      } catch {}
    })
    return () => {
      socket.off('message:new', loadConversations)
      socket.off('suggestion:ready')
    }
  }, [token, loadConversations])

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const selectConversation = async (convId: string) => {
    setSelectedId(convId)
    setSelectedMsgId(null)
    setSuggestions([])
    setContactDetail(null)
    setLoadingMsgs(true)
    setMobilePane('thread')
    setShowAIPanel(false)
    if (!token) return
    const data = await apiClient<{ messages: Message[]; contact: Contact }>(
      `/api/conversations/${convId}/messages`, { token }
    )
    setMessages(data.messages)
    setContact(data.contact)
    setLoadingMsgs(false)
    if (data.contact?.id) {
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${data.contact.id}`, { token })
        .then(d => setContactDetail(d.contact)).catch(() => {})
    }
    const last = [...data.messages].reverse().find(m => m.pendingSuggestions > 0)
    if (last) selectMessage(last.id)
  }

  const selectMessage = async (messageId: string) => {
    setSelectedMsgId(messageId)
    if (!token) return
    const data = await apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${messageId}/suggestions`, { token })
    setSuggestions(data.suggestions)
    if (data.suggestions.length > 0) setShowAIPanel(true)
  }

  const approveSuggestion = async (id: string) => {
    if (!token) return
    setActionLoading(id)
    await apiClient(`/api/suggestions/${id}/approve`, { method: 'POST', token })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    setActionLoading(null)
    if (suggestions.length === 1) setShowAIPanel(false)
  }

  const dismissSuggestion = async (id: string) => {
    if (!token) return
    setActionLoading(id)
    await apiClient(`/api/suggestions/${id}/dismiss`, { method: 'POST', token })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    setActionLoading(null)
  }

  const regenerate = async () => {
    if (!token || !selectedMsgId) return
    setRegenerating(true)
    setSuggestions([])
    await apiClient(`/api/messages/${selectedMsgId}/regenerate`, { method: 'POST', token })
    setRegenerating(false)
  }

  const filtered = conversations.filter(c =>
    !search || c.contact.name.toLowerCase().includes(search.toLowerCase())
  )
  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  const ConversationList = (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">Inbox</h1>
            {totalUnread > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {totalUnread}
              </span>
            )}
          </div>
        </div>
        <a
          href="/inbox/queue"
          className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0"
        >
          <span>⚡</span>
          <span>Queue</span>
        </a>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-gray-50 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search conversations…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-4 divide-y divide-gray-50">
            {Array.from({ length: 7 }, (_, i) => <SkeletonListItem key={i} />)}
          </div>
        ) : error ? (
          <EmptyState icon="⚠️" title="Couldn't load conversations" description="Check the API server." action={<button onClick={loadConversations} className="text-sm text-indigo-600 hover:underline">Retry</button>} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="💬" title={search ? 'No results' : 'No conversations yet'} description={search ? `No match for "${search}"` : 'Connect WhatsApp to get started.'} />
        ) : (
          filtered.map(conv => {
            const active = selectedId === conv.id
            return (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`w-full flex items-start gap-3 px-4 py-3.5 border-b border-gray-50/80 text-left transition-colors ${
                  active ? 'bg-indigo-50 border-indigo-100' : 'hover:bg-gray-50/80'
                }`}
              >
                <Avatar name={conv.contact.name} src={conv.contact.avatarUrl ?? undefined} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {conv.contact.name}
                    </span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <p className={`text-xs mt-0.5 truncate ${conv.unreadCount > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
                    {conv.lastMessagePreview || 'No messages yet'}
                  </p>
                  {mode !== 'personal' && conv.healthScore > 0 && (
                    <HealthBar score={conv.healthScore} size="sm" className="mt-1.5 w-16" />
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span className="flex-shrink-0 w-5 h-5 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center mt-0.5">
                    {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )

  const ThreadView = selectedId ? (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-100 bg-white flex-shrink-0">
        <button
          onClick={() => setMobilePane('list')}
          className="md:hidden p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
          aria-label="Back to list"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {contact && (
          <>
            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
              {contactDetail?.relationship && (
                <p className="text-xs text-gray-500 capitalize">
                  {contactDetail.relationship.type.replace(/_/g, ' ')}
                </p>
              )}
            </div>
            {suggestions.length > 0 && (
              <button
                onClick={() => setShowAIPanel(v => !v)}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg border border-amber-200"
              >
                <span>⚡</span>
                <span>{suggestions.length}</span>
              </button>
            )}
          </>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
          {loadingMsgs ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                  <div className={`h-10 rounded-2xl animate-pulse bg-gray-200 ${i % 2 === 0 ? 'w-48' : 'w-36'}`} />
                </div>
              ))}
            </div>
          ) : (
            <>
              {messages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => msg.pendingSuggestions > 0 && selectMessage(msg.id)}
                  className={`flex ${msg.senderType === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] md:max-w-sm rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                      msg.senderType === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-md'
                        : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                    } ${msg.pendingSuggestions > 0 && selectedMsgId !== msg.id ? 'ring-2 ring-amber-400 cursor-pointer' : ''}
                      ${selectedMsgId === msg.id ? 'ring-2 ring-indigo-400' : ''}`}
                  >
                    <p className="leading-relaxed">{msg.body || '(media)'}</p>
                    {msg.pendingSuggestions > 0 && (
                      <p className={`text-xs mt-1 font-medium ${msg.senderType === 'user' ? 'text-indigo-200' : 'text-amber-600'}`}>
                        ⚡ {msg.pendingSuggestions} suggestion{msg.pendingSuggestions !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Desktop AI panel */}
        {(suggestions.length > 0 || regenerating || contactDetail) && (
          <div className="hidden md:flex w-80 border-l border-gray-100 bg-white flex-col flex-shrink-0">
            {contactDetail?.profile && (
              <div className="p-4 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">Contact Profile</p>
                <p className="text-xs text-gray-700 leading-relaxed line-clamp-3">{contactDetail.profile.personalitySummary}</p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-xs text-gray-400">Mood: <span className="capitalize text-gray-600 font-medium">{contactDetail.profile.moodBaseline}</span></span>
                  <HealthBar score={contactDetail.relationship.healthScore} size="sm" className="flex-1" />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">AI Suggestions</p>
                <p className="text-xs text-gray-400">Tap a reply to send</p>
              </div>
              {selectedMsgId && (
                <button onClick={regenerate} disabled={regenerating} className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50 font-medium">
                  {regenerating ? '…' : '↺ Regenerate'}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {regenerating ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Generating…</p>
                  </div>
                </div>
              ) : suggestions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-8">No suggestions yet</p>
              ) : (
                suggestions.map(s => (
                  <div key={s.id} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize mb-2 ${TONE_COLORS[s.tone] ?? 'bg-gray-100 text-gray-700'}`}>
                      {s.tone}
                    </span>
                    <p className="text-sm text-gray-800 leading-relaxed mb-2">{s.text}</p>
                    <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">{s.reasoning}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => approveSuggestion(s.id)}
                        disabled={actionLoading === s.id}
                        className="flex-1 bg-indigo-600 text-white text-xs font-medium py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        Send
                      </button>
                      <button
                        onClick={() => dismissSuggestion(s.id)}
                        disabled={actionLoading === s.id}
                        className="flex-1 bg-white text-gray-600 text-xs font-medium py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile AI bottom sheet */}
      {showAIPanel && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAIPanel(false)} />
          <div className="relative bg-white rounded-t-2xl shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <div>
                <p className="text-sm font-semibold text-gray-900">AI Suggestions</p>
                <p className="text-xs text-gray-400">{suggestions.length} option{suggestions.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={regenerate} disabled={regenerating} className="text-xs text-indigo-600 font-medium disabled:opacity-50">
                  {regenerating ? '…' : '↺'}
                </button>
                <button onClick={() => setShowAIPanel(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 flex-1">
              {suggestions.map(s => (
                <div key={s.id} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize mb-2 ${TONE_COLORS[s.tone] ?? 'bg-gray-100 text-gray-700'}`}>
                    {s.tone}
                  </span>
                  <p className="text-sm text-gray-800 leading-relaxed mb-3">{s.text}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { approveSuggestion(s.id); setShowAIPanel(false) }}
                      disabled={actionLoading === s.id}
                      className="flex-1 bg-indigo-600 text-white text-sm font-medium py-2.5 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    >
                      Send
                    </button>
                    <button
                      onClick={() => dismissSuggestion(s.id)}
                      disabled={actionLoading === s.id}
                      className="flex-1 bg-white text-gray-600 text-sm font-medium py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-5xl mb-3">💬</div>
        <p className="text-sm font-medium text-gray-900">Select a conversation</p>
        <p className="text-xs text-gray-500 mt-1">Choose from the list to open a thread</p>
      </div>
    </div>
  )

  return (
    <div className="flex h-full bg-white">
      {/* Conversation list — hidden on mobile when thread is open */}
      <div className={`${mobilePane === 'thread' ? 'hidden md:flex' : 'flex'} md:flex flex-col w-full md:w-80 border-r border-gray-100 flex-shrink-0`}>
        {ConversationList}
      </div>

      {/* Thread pane — hidden on mobile when list is shown */}
      <div className={`${mobilePane === 'list' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0`}>
        {ThreadView}
      </div>
    </div>
  )
}
