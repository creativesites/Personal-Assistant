'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'

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

interface MessageAnalysis {
  sentiment: string
  requiresResponse: boolean
  responseUrgency: string
}

interface Message {
  id: string
  senderType: 'user' | 'contact'
  body: string | null
  timestamp: string
  analysis: MessageAnalysis | null
  pendingSuggestions: number
}

interface Suggestion {
  id: string
  text: string
  tone: string
  reasoning: string
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

export default function InboxPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
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
        // If the suggestion is for a message in the currently open conversation, reload messages
        if (selectedIdRef.current) {
          setMessages((prev) => {
            const hit = prev.find((m) => m.id === data.messageId)
            if (hit) {
              // Reload suggestions for this message automatically
              if (token) {
                apiClient<{ suggestions: Suggestion[] }>(
                  `/api/messages/${data.messageId}/suggestions`,
                  { token },
                ).then((d) => {
                  setSuggestions(d.suggestions)
                  setSelectedMessageId(data.messageId)
                })
              }
            }
            return prev
          })
        }
        loadConversations()
      } catch {}
    })

    return () => {
      socket.off('message:new', loadConversations)
      socket.off('suggestion:ready')
    }
  }, [token, loadConversations])

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const selectConversation = async (convId: string) => {
    setSelectedId(convId)
    setSelectedMessageId(null)
    setSuggestions([])
    setContactDetail(null)
    setLoadingMessages(true)
    if (!token) return
    const data = await apiClient<{ messages: Message[]; contact: Contact }>(
      `/api/conversations/${convId}/messages`,
      { token },
    )
    setMessages(data.messages)
    setContact(data.contact)
    setLoadingMessages(false)

    // Load full contact detail for context panel
    if (data.contact?.id) {
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${data.contact.id}`, { token })
        .then((d) => setContactDetail(d.contact))
        .catch(() => {})
    }

    // Auto-select last message that has pending suggestions
    const last = [...data.messages].reverse().find((m) => m.pendingSuggestions > 0)
    if (last) selectMessage(last.id)
  }

  const selectMessage = async (messageId: string) => {
    setSelectedMessageId(messageId)
    if (!token) return
    const data = await apiClient<{ suggestions: Suggestion[] }>(
      `/api/messages/${messageId}/suggestions`,
      { token },
    )
    setSuggestions(data.suggestions)
  }

  const approveSuggestion = async (suggestionId: string) => {
    if (!token) return
    setActionLoading(suggestionId)
    await apiClient(`/api/suggestions/${suggestionId}/approve`, { method: 'POST', token })
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId))
    setActionLoading(null)
  }

  const dismissSuggestion = async (suggestionId: string) => {
    if (!token) return
    setActionLoading(suggestionId)
    await apiClient(`/api/suggestions/${suggestionId}/dismiss`, { method: 'POST', token })
    setSuggestions((prev) => prev.filter((s) => s.id !== suggestionId))
    setActionLoading(null)
  }

  const regenerateSuggestions = async () => {
    if (!token || !selectedMessageId) return
    setRegenerating(true)
    setSuggestions([])
    await apiClient(`/api/messages/${selectedMessageId}/regenerate`, { method: 'POST', token })
    setRegenerating(false)
  }

  if (session.status === 'loading' || loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-400">Loading conversations...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center flex-col gap-3">
        <p className="text-sm text-gray-500">Couldn&apos;t reach the backend.</p>
        <p className="text-xs text-gray-400">Make sure the API server is running.</p>
        <button
          onClick={loadConversations}
          className="text-sm text-indigo-600 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Conversation list */}
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-gray-100">
          <h1 className="font-semibold text-gray-900">Inbox</h1>
          {conversations.some((c) => c.unreadCount > 0) && (
            <span className="ml-2 bg-indigo-600 text-white text-xs rounded-full px-1.5 py-0.5">
              {conversations.reduce((n, c) => n + c.unreadCount, 0)}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="p-4 text-sm text-gray-400">No conversations yet. Connect WhatsApp to get started.</p>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-50 text-left transition-colors ${
                  selectedId === conv.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600 shrink-0">
                  {conv.contact.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-900 truncate">{conv.contact.name}</span>
                    <span className="text-xs text-gray-400 shrink-0 ml-2">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {conv.lastMessagePreview || 'No messages yet'}
                  </p>
                </div>
                {conv.unreadCount > 0 && (
                  <span className="shrink-0 w-5 h-5 bg-indigo-600 text-white text-xs rounded-full flex items-center justify-center">
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Message thread */}
      {selectedId ? (
        <div className="flex-1 flex flex-col min-w-0">
          <div className="h-14 border-b border-gray-200 bg-white flex items-center px-4 gap-3 shrink-0">
            {contact && (
              <>
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <p className="text-sm font-medium text-gray-900">{contact.name}</p>
              </>
            )}
          </div>

          <div className="flex flex-1 min-h-0">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages ? (
                <p className="text-sm text-gray-400 text-center mt-8">Loading messages...</p>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => msg.pendingSuggestions > 0 && selectMessage(msg.id)}
                      className={`flex ${msg.senderType === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-sm xl:max-w-md rounded-2xl px-3.5 py-2 text-sm ${
                          msg.senderType === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-sm'
                            : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
                        } ${
                          msg.pendingSuggestions > 0 && selectedMessageId !== msg.id
                            ? 'ring-2 ring-amber-400 cursor-pointer'
                            : ''
                        } ${selectedMessageId === msg.id ? 'ring-2 ring-indigo-400' : ''}`}
                      >
                        <p>{msg.body || '(media)'}</p>
                        {msg.pendingSuggestions > 0 && (
                          <p className={`text-xs mt-1 ${msg.senderType === 'user' ? 'text-indigo-200' : 'text-amber-600'}`}>
                            {msg.pendingSuggestions} reply suggestion{msg.pendingSuggestions > 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Right panel: contact context + suggestions */}
            {(suggestions.length > 0 || regenerating || contactDetail) && (
              <div className="w-80 border-l border-gray-200 bg-white flex flex-col shrink-0">
                {/* Contact context */}
                {contactDetail?.profile && (
                  <div className="p-4 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Contact Profile</p>
                    <p className="text-xs text-gray-700 leading-relaxed">{contactDetail.profile.personalitySummary}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-400">
                        Mood: <span className="capitalize text-gray-600">{contactDetail.profile.moodBaseline}</span>
                      </span>
                      <span className="text-xs text-gray-400">
                        Health: <span className={`font-medium ${
                          contactDetail.relationship.healthScore >= 75 ? 'text-green-600'
                          : contactDetail.relationship.healthScore >= 50 ? 'text-amber-500'
                          : 'text-red-500'
                        }`}>{contactDetail.relationship.healthScore}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">AI Suggestions</p>
                    <p className="text-xs text-gray-400 mt-0.5">Select one to send or dismiss</p>
                  </div>
                  {selectedMessageId && (
                    <button
                      onClick={regenerateSuggestions}
                      disabled={regenerating}
                      className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                    >
                      {regenerating ? '...' : 'Regenerate'}
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {regenerating ? (
                    <p className="text-xs text-gray-400 text-center py-4">Generating new suggestions...</p>
                  ) : suggestions.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No suggestions yet</p>
                  ) : (
                    suggestions.map((s) => (
                      <div key={s.id} className="border border-gray-200 rounded-xl p-3">
                        <p className="text-xs text-indigo-600 font-medium capitalize mb-1.5">{s.tone}</p>
                        <p className="text-sm text-gray-800 mb-2">{s.text}</p>
                        <p className="text-xs text-gray-400 mb-3">{s.reasoning}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveSuggestion(s.id)}
                            disabled={actionLoading === s.id}
                            className="flex-1 bg-indigo-600 text-white text-xs py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                          >
                            Send
                          </button>
                          <button
                            onClick={() => dismissSuggestion(s.id)}
                            disabled={actionLoading === s.id}
                            className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
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
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
          Select a conversation to start
        </div>
      )}
    </div>
  )
}
