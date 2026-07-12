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
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> New Chat
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
          <input type="text" placeholder="Search conversations..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 text-xs rounded-xl pl-9 pr-4 py-2 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-slate-700" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-3">
        {loadingSessions && (
          <div className="space-y-1.5 px-2">
            {[1,2,3].map(i => <div key={i} className="h-8 bg-slate-900 rounded-xl animate-pulse" />)}
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
                className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all group ${activeSessionId === sess.id ? 'bg-slate-800/80 text-white border border-slate-700/50' : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 border border-transparent'}`}>
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
                className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all group ${activeSessionId === sess.id ? 'bg-slate-800/80 text-white border border-slate-700/50' : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 border border-transparent'}`}>
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
            className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all ${activeSessionId === sess.id ? 'bg-slate-800/80 text-white' : 'text-slate-400 hover:bg-slate-900/60'}`}>
            <span className="truncate block">{sess.title}</span>
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-100 font-sans overflow-hidden">

      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-950 border-r border-slate-800 flex flex-col">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
              <span className="text-xs font-bold text-white">Conversations</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <SidebarContent />
            <div className="p-3 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>Connected</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <div className="w-72 bg-slate-950 border-r border-slate-800 flex-col h-full flex-shrink-0 hidden lg:flex">
        <SidebarContent />
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Connected</span>
          </div>
          <span className="font-mono text-slate-600">v4.2</span>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full bg-slate-900 relative min-w-0">

        {/* HEADER */}
        <header className="h-14 md:h-16 border-b border-slate-800 bg-slate-950 px-3 md:px-5 flex items-center justify-between flex-shrink-0 gap-2 z-20">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-400 hover:text-white lg:hidden">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-white/5 p-0.5 flex items-center justify-center">
                <Brain className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="hidden sm:block">
                <h4 className="text-sm font-bold text-white leading-tight">AI Advisor</h4>
                <p className="text-[10px] text-slate-500">Ask anything about your contacts & conversations</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <button onClick={startNewChat} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
            <button onClick={() => setInspectorOpen(!inspectorOpen)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors xl:hidden" title="Context panel">
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* MESSAGES AREA */}
        <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6 space-y-5">
          {isEmpty ? (
            <div className="max-w-2xl mx-auto space-y-6 pt-2 md:pt-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white">Your AI Business Assistant</h2>
                <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                  I have full context on all your WhatsApp conversations and contacts. Ask me anything — draft messages, find opportunities, or get a status update on your relationships.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center">Try asking</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_CHIPS.map((chip, idx) => {
                    const Icon = chip.icon
                    return (
                      <button key={idx} onClick={() => sendMessage(chip.query)}
                        className="text-left p-3 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl transition-all flex items-start gap-2.5 group">
                        <Icon className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-300 group-hover:text-white leading-snug">{chip.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {messages.map(msg => {
                const isUser = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">Z</div>
                    )}
                    <div className={`space-y-2 max-w-[88%] ${isUser ? 'order-1' : 'order-2'}`}>
                      <div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        isUser
                          ? 'bg-indigo-600 text-white whitespace-pre-wrap'
                          : 'bg-slate-950 border border-slate-800 text-slate-200'
                      }`}>
                        {isUser ? (
                          <>{msg.content}<div className="text-[9px] text-indigo-300/70 mt-1.5">{timeAgo(msg.timestamp)}</div></>
                        ) : (
                          <>
                            <ChatFormatter
                              content={msg.content}
                              theme="dark"
                              onAction={async (_action: ParsedAction) => {
                                // TODO: wire CRM actions through API when contact context is available
                              }}
                            />
                            <div className="text-[9px] text-slate-500 mt-2 flex items-center gap-2">
                              {timeAgo(msg.timestamp)}
                              <div className="flex items-center gap-1 ml-auto">
                                <button onClick={() => navigator.clipboard.writeText(msg.content)} className="p-0.5 hover:text-white" title="Copy"><Copy className="w-3 h-3" /></button>
                                <button className="p-0.5 hover:text-emerald-400"><ThumbsUp className="w-3 h-3" /></button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* WhatsApp draft preview */}
                      {!isUser && msg.componentType === 'whatsapp_preview' && msg.componentData && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 max-w-sm">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-emerald-400 font-bold">WhatsApp Draft</span>
                            <span className="text-slate-500">{msg.componentData.confidence as number}% confidence</span>
                          </div>
                          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                            <p className="text-[11px] text-slate-300 leading-relaxed">{msg.componentData.preview as string}</p>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => navigator.clipboard.writeText(msg.componentData!.preview as string)} className="px-3 py-1.5 text-[10px] text-slate-400 hover:text-white font-medium border border-slate-800 rounded-lg">Copy</button>
                            <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Use Draft
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {isUser && (
                      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">W</div>
                    )}
                  </div>
                )
              })}
              {loading && (
                <div className="flex gap-3 items-center">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs font-bold animate-pulse">Z</div>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5">
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
          <div className="absolute bottom-24 left-4 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-1.5 w-56 z-30">
            <p className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1">Commands</p>
            {['/contact', '/chat', '/report', '/knowledge', '/automation', '/calendar', '/send'].map(cmd => (
              <button key={cmd} onClick={() => selectCommand(cmd)} className="w-full text-left text-xs px-2 py-1.5 text-slate-300 hover:bg-slate-900 rounded-lg font-mono">{cmd}</button>
            ))}
          </div>
        )}
        {showMentionMenu && (
          <div className="absolute bottom-24 left-4 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-1.5 w-56 z-30">
            <p className="text-[9px] font-bold text-slate-500 uppercase px-2 py-1">Mention</p>
            {['@Grace_Clothing', '@Peter_Banda', '@Mary_Phiri', '@June_Report'].map(m => (
              <button key={m} onClick={() => selectMention(m)} className="w-full text-left text-xs px-2 py-1.5 text-slate-300 hover:bg-slate-900 rounded-lg">{m}</button>
            ))}
          </div>
        )}

        {/* FIXED BOTTOM INPUT */}
        <div className="flex-shrink-0 bg-slate-950 border-t border-slate-800 px-3 py-3 md:px-6 z-20">
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-slate-700 transition-all relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your contacts, draft a message, or type / for commands..."
                rows={1}
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none px-2 pt-1.5 pb-10 min-h-[44px]"
                style={{ maxHeight: '120px' }}
              />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1 pointer-events-auto">
                  <button className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors" title="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors" title="Voice input">
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || loading}
                  className="pointer-events-auto w-9 h-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md"
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
      <div className={`w-80 bg-slate-950 border-l border-slate-800 flex-col h-full flex-shrink-0 ${inspectorOpen ? 'fixed right-0 top-0 bottom-0 z-40 xl:relative xl:z-0 flex' : 'hidden xl:flex'}`}>
        <div className="p-4 border-b border-slate-800 flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Context
          </p>
          <button onClick={() => setInspectorOpen(false)} className="p-1 text-slate-400 hover:text-white xl:hidden"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
          {/* Active session info */}
          {activeSessionId && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Active Session</label>
              <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl">
                <p className="text-xs font-semibold text-white truncate">
                  {sessions.find(s => s.id === activeSessionId)?.title ?? 'Session'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
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
                  className="w-full text-left p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> {a}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Tips</label>
            <div className="space-y-2 text-[11px] text-slate-400">
              <p>Type <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono">/</kbd> for commands</p>
              <p>Type <kbd className="bg-slate-800 px-1 py-0.5 rounded text-[10px] font-mono">@</kbd> to mention a contact</p>
              <p>Ask me to draft a WhatsApp message and I&apos;ll show a preview with a Copy button</p>
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-2 flex-shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-indigo-500/80" />
          <span>Your data stays private</span>
        </div>
      </div>
    </div>
  )
}
