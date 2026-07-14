'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Brain, Send, Search, Pin, FileText, BarChart3,
  Sparkles, CheckCircle2, ChevronRight, X, Sliders,
  Calendar, Paperclip, Mic, ArrowUpRight,
  AlertCircle, TrendingUp, Zap, Clock, Users, ShieldAlert,
  MessageSquare, Star, Edit3,
  MoreHorizontal, Download, RefreshCw, Menu, PanelRight,
  Plus, Trash2, Copy, ThumbsUp, ThumbsDown
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { ChatFormatter, type ParsedAction } from '@/components/ui/chat-formatter'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

// --- TYPE DEFINITIONS ---
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  componentType?: 'whatsapp_preview' | 'source_list'
  componentData?: Record<string, unknown>
}

interface AdvisorSession {
  id: string
  title: string
  message_count: number
  contact_name: string | null
  created_at: string
  updated_at: string
}

// --- STATIC CONTENT ---
const SUGGESTED_CHIPS = [
  { icon: TrendingUp, label: 'How are sales this month?', query: 'How are sales going this month? Which contacts are showing the most buying interest?' },
  { icon: Users, label: 'Which leads need attention?', query: 'Which contacts need follow-up right now? Who has been quiet for too long?' },
  { icon: Zap, label: 'Draft a follow-up message', query: 'Draft a WhatsApp message to re-engage a VIP customer who hasn\'t replied in a week' },
  { icon: Calendar, label: "What's on my plate today?", query: 'What are the most important conversations I should respond to today? Any urgent follow-ups?' },
  { icon: BarChart3, label: 'Analyze response patterns', query: 'Which contacts have been most engaged recently and which are going quiet?' },
  { icon: MessageSquare, label: 'Find opportunities', query: 'Which conversations show buying intent or opportunities I should act on?' },
]

const SPOTLIGHT_CARDS = [
  { icon: Star, label: 'Daily priority map', text: 'Rank replies by urgency, value, and relationship risk.', query: 'Build my priority map for today. Who should I respond to first and why?' },
  { icon: ShieldAlert, label: 'Relationship risk scan', text: 'Find quiet VIPs, declining warmth, and exposed revenue.', query: 'Scan my relationships for risk. Which important contacts are cooling off?' },
  { icon: FileText, label: 'Executive brief', text: 'Turn messy conversations into a clean operating summary.', query: 'Give me an executive brief of the most important activity across my WhatsApp conversations.' },
]

const COMMANDS = ['/contact', '/chat', '/report', '/knowledge', '/automation', '/calendar', '/send']
const MENTIONS = ['@Grace_Clothing', '@Peter_Banda', '@Mary_Phiri', '@June_Report']

function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function detectComponentType(question: string): 'whatsapp_preview' | 'source_list' | undefined {
  const q = question.toLowerCase()
  if (q.includes('draft') || (q.includes('write') && q.includes('message')) || q.includes('send a message') || q.includes('follow-up message') || q.includes('follow up message')) {
    return 'whatsapp_preview'
  }
  return undefined
}

// --- MAIN COMPONENT ---
export default function AdvisorPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  // Sessions
  const [sessions, setSessions] = useState<AdvisorSession[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  // Chat
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, loading])

  // ── Session management ─────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    if (!token) return
    setLoadingSessions(true)
    try {
      const res = await fetch(`${API_URL}/api/advisor/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { sessions: AdvisorSession[] }
      setSessions(data.sessions)
    } catch {} finally {
      setLoadingSessions(false)
    }
  }, [token])

  useEffect(() => { loadSessions() }, [loadSessions])

  const createSession = async (title?: string): Promise<AdvisorSession | null> => {
    if (!token) return null
    try {
      const res = await fetch(`${API_URL}/api/advisor/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title ?? 'New conversation' }),
      })
      const data = await res.json() as { session: AdvisorSession }
      setSessions(prev => [data.session, ...prev])
      return data.session
    } catch {
      return null
    }
  }

  const loadSessionMessages = async (sessionId: string) => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/advisor/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { messages: Array<{ id: string; role: string; content: string; created_at: string }> }
      const msgs: Message[] = data.messages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: new Date(m.created_at),
      }))
      setMessages(msgs)
    } catch {}
  }

  const switchSession = async (sess: AdvisorSession) => {
    if (sess.id === activeSessionId) return
    setActiveSessionId(sess.id)
    setMessages([])
    setSidebarOpen(false)
    await loadSessionMessages(sess.id)
  }

  const startNewChat = async () => {
    setMessages([])
    setActiveSessionId(null)
    setSidebarOpen(false)
    inputRef.current?.focus()
  }

  // ── Send message ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading || !token) return

    // Optimistically add user message
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setShowSlashMenu(false)
    setShowMentionMenu(false)

    try {
      // Ensure we have an active session
      let sessionId = activeSessionId
      if (!sessionId) {
        const newSession = await createSession(text.slice(0, 60))
        if (!newSession) throw new Error('Could not create session')
        sessionId = newSession.id
        setActiveSessionId(newSession.id)
      }

      const res = await fetch(`${API_URL}/api/advisor/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text.trim() }),
      })

      if (!res.ok) throw new Error('API error')

      const data = await res.json() as { message: { id: string; role: string; content: string; created_at: string } }
      const answerText = data.message.content

      // Detect component type from question intent
      const componentType = detectComponentType(text)
      const componentData: Record<string, unknown> | undefined = componentType === 'whatsapp_preview'
        ? { preview: answerText, recipient: 'Contact', confidence: 88 }
        : undefined

      const assistantMsg: Message = {
        id: data.message.id,
        role: 'assistant',
        content: componentType === 'whatsapp_preview' ? 'I\'ve drafted a WhatsApp message for you:' : answerText,
        timestamp: new Date(data.message.created_at),
        componentType,
        componentData,
      }
      setMessages(prev => [...prev, assistantMsg])

      // Refresh session list (updates title + message_count)
      loadSessions()
    } catch {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        content: 'Unable to reach the AI service. Please check that the intelligence service is running.',
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }, [loading, token, activeSessionId, loadSessions])

  // Handle AI-embedded action tags. Only `generate_document` is wired here —
  // the global Advisor (unlike the per-contact IntelPanel chat) has no single
  // contact in view, but the tag itself carries a contact_id supplied by the
  // model from the CRM context list, so no extra lookup is needed.
  const handleChatAction = useCallback(async (action: ParsedAction) => {
    if (action.type !== 'generate_document' || !token) return
    const [documentType, contactId, ...briefParts] = action.params
    if (!contactId) throw new Error('Missing contact_id')
    const brief = briefParts.join(' | ')

    const genRes = await fetch(`${API_URL}/api/documents/ai-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ contactId, documentType, instruction: brief || `Draft a ${documentType}` }),
    })
    if (!genRes.ok) throw new Error('Failed to generate document')
    const { document } = await genRes.json() as { document: { id: string } }

    const renderRes = await fetch(`${API_URL}/api/documents/${document.id}/generate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!renderRes.ok) throw new Error('Failed to render document')
  }, [token])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    if (val.endsWith('/')) { setShowSlashMenu(true); setShowMentionMenu(false) }
    else if (val.endsWith('@')) { setShowMentionMenu(true); setShowSlashMenu(false) }
    else { setShowSlashMenu(false); setShowMentionMenu(false) }
    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const selectCommand = (cmd: string) => { setInput(prev => prev + cmd + ' '); setShowSlashMenu(false); inputRef.current?.focus() }
  const selectMention = (mention: string) => { setInput(prev => prev + mention + ' '); setShowMentionMenu(false); inputRef.current?.focus() }

  const isEmpty = messages.length === 0

  // Sidebar session list grouped into Today / Recent
  const todaySessions = sessions.filter(s => {
    const d = new Date(s.updated_at)
    const now = new Date()
    return d.toDateString() === now.toDateString()
  })
  const olderSessions = sessions.filter(s => !todaySessions.includes(s))
  const filteredSessions = sessions.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()))

  const SidebarContent = () => (
    <>
      <div className="p-3 space-y-2.5">
        <button
          onClick={startNewChat}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
        >
          <Plus className="w-3.5 h-3.5" /> New Chat
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input type="text" placeholder="Search conversations..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 text-xs rounded-2xl pl-9 pr-4 py-2.5 text-slate-700 placeholder-slate-400 shadow-sm focus:outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-100" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
        {loadingSessions && (
          <div className="space-y-1.5 px-2">
            {[1,2,3].map(i => <div key={i} className="h-8 bg-slate-50 rounded-xl animate-pulse" />)}
          </div>
        )}
        {!loadingSessions && filteredSessions.length === 0 && (
          <p className="text-[10px] text-slate-500 text-center py-6">No conversations yet. Start chatting!</p>
        )}
        {todaySessions.length > 0 && !searchTerm && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 flex items-center gap-1.5 py-1">
              <Clock className="w-2.5 h-2.5 text-emerald-400" /> Today
            </p>
            {todaySessions.map(sess => (
              <button key={sess.id} onClick={() => switchSession(sess)}
                className={`w-full text-left px-3 py-2.5 rounded-2xl text-xs transition-all group ${activeSessionId === sess.id ? 'bg-indigo-50 text-indigo-900 border border-indigo-100 shadow-sm' : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-800 border border-transparent'}`}>
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                  <span className="truncate">{sess.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {olderSessions.length > 0 && !searchTerm && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 py-1">Recent</p>
            {olderSessions.map(sess => (
              <button key={sess.id} onClick={() => switchSession(sess)}
                className={`w-full text-left px-3 py-2.5 rounded-2xl text-xs transition-all group ${activeSessionId === sess.id ? 'bg-indigo-50 text-indigo-900 border border-indigo-100 shadow-sm' : 'text-slate-500 hover:bg-slate-50/80 hover:text-slate-800 border border-transparent'}`}>
                <div className="flex items-center gap-2 truncate">
                  <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                  <span className="truncate">{sess.title}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {searchTerm && filteredSessions.map(sess => (
          <button key={sess.id} onClick={() => switchSession(sess)}
            className={`w-full text-left px-3 py-2.5 rounded-2xl text-xs transition-all ${activeSessionId === sess.id ? 'bg-indigo-50 text-indigo-900' : 'text-slate-500 hover:bg-slate-50/80'}`}>
            <span className="truncate block">{sess.title}</span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div className="flex h-full min-h-full w-full bg-[linear-gradient(180deg,#eef2ff_0%,#f8fafc_260px,#f8fafc_100%)] text-slate-900 font-sans overflow-hidden">

      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-950/30" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white border-r border-slate-200 flex flex-col shadow-2xl shadow-slate-950/20">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold text-slate-950">Conversations</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-500 hover:text-slate-950"><X className="w-4 h-4" /></button>
            </div>
            <SidebarContent />
            <div className="p-3 bg-white border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Connected</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <div className="w-72 bg-white/90 border-r border-slate-200 flex-col h-full flex-shrink-0 hidden lg:flex backdrop-blur-xl">
        <SidebarContent />
        <div className="p-3 bg-white border-t border-slate-200 text-[10px] text-slate-500 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Connected</span>
          </div>
          <span className="font-mono text-slate-600">v4.2</span>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full bg-transparent relative min-w-0">

        {/* HEADER */}
        <header className="h-14 md:h-16 border-b border-white/80 bg-white/80 px-3 md:px-5 flex items-center justify-between flex-shrink-0 gap-2 z-20 backdrop-blur-xl shadow-sm shadow-indigo-100/50">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-500 hover:text-slate-950 lg:hidden">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-200">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <h4 className="text-sm font-bold text-slate-950 leading-tight">AI Advisor</h4>
                <p className="text-[10px] text-slate-500">Ask anything about your contacts & conversations</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <button onClick={startNewChat} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl transition-colors">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
            <button onClick={() => setInspectorOpen(!inspectorOpen)} className="p-2 text-slate-500 hover:text-slate-950 hover:bg-slate-50 rounded-lg transition-colors xl:hidden" title="Context panel">
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* MESSAGES AREA */}
        <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6 space-y-5">
          {isEmpty ? (
            <div className="max-w-4xl mx-auto space-y-6 pt-2 md:pt-6">
              <div className="relative overflow-hidden rounded-[2rem] bg-white px-5 py-7 text-center shadow-xl shadow-indigo-200/30 ring-1 ring-white md:px-8">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(34,211,238,0.22),transparent_30%),radial-gradient(circle_at_12%_88%,rgba(99,102,241,0.18),transparent_34%)]" />
                <div className="relative">
                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-indigo-200">
                    <Brain className="w-8 h-8 text-white" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-600">Advisor cockpit</p>
                  <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-slate-950">Ask Zuri what to do next</h2>
                  <p className="mt-3 text-sm text-slate-600 max-w-xl mx-auto leading-6">
                    Turn WhatsApp chaos into decisions, drafts, next steps, and relationship intelligence. Start with a question or tap a mission below.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {SPOTLIGHT_CARDS.map((card) => {
                  const Icon = card.icon
                  return (
                    <button
                      key={card.label}
                      onClick={() => sendMessage(card.query)}
                      className="group text-left rounded-[1.75rem] border border-white bg-white/90 p-4 shadow-sm shadow-indigo-100/60 ring-1 ring-slate-100 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-100"
                    >
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-black text-slate-950">{card.label}</p>
                      <p className="mt-1.5 text-xs leading-5 text-slate-500">{card.text}</p>
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-indigo-600">
                        Run mission <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Try asking</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SUGGESTED_CHIPS.map((chip, idx) => {
                    const Icon = chip.icon
                    return (
                      <button key={idx} onClick={() => sendMessage(chip.query)}
                        className="text-left p-3.5 bg-white/80 hover:bg-white border border-white hover:border-indigo-100 rounded-2xl shadow-sm shadow-slate-200/60 transition-all flex items-start gap-2.5 group">
                        <Icon className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-700 group-hover:text-slate-950 leading-snug">{chip.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map(msg => {
                const isUser = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 shadow-lg shadow-indigo-200">Z</div>
                    )}
                    <div className={`space-y-2 max-w-[88%] ${isUser ? 'order-1' : 'order-2'}`}>
                      <div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-indigo-600 text-white whitespace-pre-wrap shadow-lg shadow-indigo-200'
                          : 'bg-white border border-white text-slate-800 shadow-sm shadow-slate-200/80 ring-1 ring-slate-100'
                      }`}>
                        {isUser ? (
                          <>{msg.content}<div className="text-[9px] text-indigo-300/70 mt-1.5">{timeAgo(msg.timestamp)}</div></>
                        ) : (
                          <>
                            <ChatFormatter
                              content={msg.content}
                              theme="light"
                              onAction={handleChatAction}
                            />
                            <div className="text-[9px] text-slate-500 mt-3 flex items-center gap-2 border-t border-slate-100 pt-2">
                              {timeAgo(msg.timestamp)}
                              <div className="flex items-center gap-1 ml-auto">
                                <button onClick={() => navigator.clipboard.writeText(msg.content)} className="rounded-lg p-1 hover:bg-slate-50 hover:text-slate-950" title="Copy"><Copy className="w-3 h-3" /></button>
                                <button className="rounded-lg p-1 hover:bg-emerald-50 hover:text-emerald-600"><ThumbsUp className="w-3 h-3" /></button>
                                <button className="rounded-lg p-1 hover:bg-rose-50 hover:text-rose-500"><ThumbsDown className="w-3 h-3" /></button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* WhatsApp draft preview */}
                      {!isUser && msg.componentType === 'whatsapp_preview' && msg.componentData && (
                        <div className="bg-gradient-to-br from-emerald-50 to-cyan-50 border border-emerald-100 rounded-3xl p-3.5 space-y-2.5 max-w-sm shadow-sm shadow-emerald-100/80">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-emerald-400 font-bold">WhatsApp Draft</span>
                            <span className="text-slate-500">{msg.componentData.confidence as number}% confidence</span>
                          </div>
                          <div className="bg-white border border-emerald-100 rounded-2xl p-3 shadow-sm">
                            <p className="text-[11px] text-slate-700 leading-relaxed">{msg.componentData.preview as string}</p>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => navigator.clipboard.writeText(msg.componentData!.preview as string)} className="px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-950 font-medium border border-slate-200 rounded-lg">Copy</button>
                            <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-xl flex items-center gap-1 shadow-sm">
                              <CheckCircle2 className="w-3 h-3" /> Use Draft
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 text-xs font-bold flex-shrink-0 mt-0.5">W</div>
                    )}
                  </div>
                )
              })}
              {loading && (
                <div className="flex gap-3 items-center">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold animate-pulse">Z</div>
                  <div className="bg-white border border-white rounded-2xl px-4 py-2.5 shadow-sm ring-1 ring-slate-100">
                    <div className="flex gap-1">
                      <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" />
                      <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                      <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* SLASH / MENTION POPUPS */}
        {showSlashMenu && (
          <div className="absolute bottom-24 left-4 bg-white border border-white rounded-2xl shadow-2xl shadow-slate-950/10 p-1.5 w-60 z-30 ring-1 ring-slate-100">
            <p className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1">Commands</p>
            {COMMANDS.map(cmd => (
              <button key={cmd} onClick={() => selectCommand(cmd)} className="w-full text-left text-xs px-2.5 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 rounded-xl font-mono">{cmd}</button>
            ))}
          </div>
        )}
        {showMentionMenu && (
          <div className="absolute bottom-24 left-4 bg-white border border-white rounded-2xl shadow-2xl shadow-slate-950/10 p-1.5 w-60 z-30 ring-1 ring-slate-100">
            <p className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1">Mention</p>
            {MENTIONS.map(m => (
              <button key={m} onClick={() => selectMention(m)} className="w-full text-left text-xs px-2.5 py-2 text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 rounded-xl">{m}</button>
            ))}
          </div>
        )}

        {/* FIXED BOTTOM INPUT */}
        <div className="flex-shrink-0 bg-white/80 border-t border-white px-3 py-3 md:px-6 z-20 backdrop-blur-xl shadow-[0_-16px_40px_rgba(15,23,42,0.05)]">
          <div className="max-w-3xl mx-auto">
            <div className="bg-white border border-white rounded-[1.75rem] p-2 focus-within:border-indigo-200 focus-within:ring-4 focus-within:ring-indigo-100 transition-all relative shadow-xl shadow-indigo-100/40 ring-1 ring-slate-100">
              <div className="mb-1 flex flex-wrap gap-1.5 px-2 pt-1">
                {['Priority map', 'Draft reply', 'Risk scan'].map(label => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setInput(label === 'Draft reply' ? 'Draft a warm WhatsApp reply to ' : `Run a ${label.toLowerCase()} for me`)}
                    className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-100 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your contacts, draft a message, or type / for commands..."
                rows={1}
                className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 resize-none focus:outline-none px-2 pt-1.5 pb-10 min-h-[44px]"
                style={{ maxHeight: '120px' }}
              />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1 pointer-events-auto">
                  <button className="p-2 text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-50 transition-colors" title="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-50 transition-colors" title="Voice input">
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="pointer-events-auto w-10 h-10 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-200"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-2">
              AI Advisor has context on all your WhatsApp conversations. <span className="text-slate-600">Always verify important info.</span>
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT INSPECTOR PANEL */}
      <div className={`w-80 bg-white/90 border-l border-slate-200 flex-col h-full flex-shrink-0 backdrop-blur-xl ${inspectorOpen ? 'fixed right-0 top-0 bottom-0 z-40 xl:relative xl:z-0 flex shadow-2xl shadow-slate-950/15' : 'hidden xl:flex'}`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Context
          </p>
          <button onClick={() => setInspectorOpen(false)} className="p-1 text-slate-500 hover:text-slate-950 xl:hidden"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Active session info */}
          {activeSessionId && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Active Session</label>
              <div className="bg-indigo-50 border border-indigo-100 p-3 rounded-2xl">
                <p className="text-xs font-semibold text-slate-950 truncate">
                  {sessions.find(s => s.id === activeSessionId)?.title ?? 'Session'}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {sessions.find(s => s.id === activeSessionId)?.message_count ?? 0} messages
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Quick Actions</label>
            <div className="space-y-1.5">
              {[
                'Summarize today\'s conversations',
                'Which contacts need follow-up?',
                'Draft a check-in message',
                'Show my top opportunities',
              ].map((a, i) => (
                <button key={i} onClick={() => sendMessage(a)}
                  className="w-full text-left p-2.5 bg-white border border-slate-100 rounded-2xl text-xs text-slate-700 hover:bg-indigo-50 hover:border-indigo-100 hover:text-indigo-900 transition-colors flex items-center gap-2 shadow-sm">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Tips</label>
            <div className="space-y-2 text-[11px] text-slate-500">
              <p>Type <kbd className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono">/</kbd> for commands</p>
              <p>Type <kbd className="bg-slate-100 px-1 py-0.5 rounded text-[10px] font-mono">@</kbd> to mention a contact</p>
              <p>Ask me to draft a WhatsApp message and I&apos;ll show a preview with a Copy button</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-white border-t border-slate-200 text-[10px] text-slate-500 flex items-center gap-2 flex-shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-indigo-500/80" />
          <span>Your data stays private</span>
        </div>
      </div>
    </div>
  )
}
