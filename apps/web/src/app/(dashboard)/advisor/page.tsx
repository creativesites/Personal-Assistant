'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Brain, Send, Search, Pin, FileText, BarChart3,
  Sparkles, CheckCircle2, ChevronRight, X, Sliders,
  Calendar, Paperclip, Mic, ArrowUpRight,
  AlertCircle, TrendingUp, Zap, Clock, Users, ShieldAlert,
  MessageSquare, Star, Edit3,
  MoreHorizontal, Download, RefreshCw, Menu, PanelRight,
  Plus, Trash2, Copy, ThumbsUp, ThumbsDown, BookHeart, UserCog, Smile
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { ApiError } from '@/lib/api'
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
  companion_mode?: string
  created_at: string
  updated_at: string
}

// Advisor Companion Plan Phase 1 (docs/ADVISOR_COMPANION_PLAN.md §4.2/§4.5/
// §6.1/§7.2/§7.3/§7.6) — companion mode chips, the memory drawer, and the
// (hidden, discovery-only) Personalisation tab.
interface AssistantState {
  mood: string
  companionMode: string
  confidence: number
  needsClarification: boolean
  intent: string
}

interface AdvisorMemory {
  id: string
  memoryType: string
  memoryKey: string
  memoryValue: string
  confidence: number
  evidenceCount: number
  lastSeenAt: string
  createdAt: string
}

// Advisor Companion Plan Phase 4.5 (docs/ADVISOR_COMPANION_PLAN.md §3.7/
// §6.9/§7.7/§9) — the "Zuri Noticed Something" card. Only gossip items
// need this dedicated delivery UI; interest/devotional/motivational
// nudges already arrive as normal advisor_messages rows in chat.
interface CompanionFeedItem {
  kind: 'gossip' | 'interest'
  id: string
  contactId?: string
  contactName?: string
  signalType?: string
  summary?: string
  confidence?: number
  inCloseCircle?: boolean
  timestamp: string
}

interface AdvisorProfile {
  displayPersona: Record<string, unknown>
  tonePreferences: Record<string, unknown>
  advicePreferences: Record<string, unknown>
  boundaries: Record<string, unknown>
  relationshipContext: Record<string, unknown>
  interests: string[]
  spiritualPreferences: { tradition?: string; denomination?: string; devotionalTime?: string; preferredTranslation?: string }
  motivationalStyle: Record<string, unknown>
  gossipStyle: Record<string, unknown>
  companionFeaturesPaused: boolean
  personalModeEnabled: boolean
}

// §4.4/§7.2 — gossip and spiritual_companion are included per Phase 1's own
// bullet list; spiritual_companion is only rendered once a tradition is set
// (§3.9/§8.5's consent gate — reachability, not consent, is what Phase 1 ships).
const COMPANION_MODES: { key: string; label: string }[] = [
  { key: 'balanced', label: 'Balanced' },
  { key: 'best_friend', label: 'Best friend' },
  { key: 'coach', label: 'Coach' },
  { key: 'therapist_like', label: 'Soft mode' },
  { key: 'business_partner', label: 'Business brain' },
  { key: 'dating_advisor', label: 'Dating advice' },
  { key: 'analyst', label: 'Analyst' },
  { key: 'gossip', label: 'Gossip mode' },
]

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

  // Advisor Companion Plan Phase 1
  const [companionMode, setCompanionMode] = useState('balanced')
  const [lastAssistantState, setLastAssistantState] = useState<AssistantState | null>(null)
  const [inspectorTab, setInspectorTab] = useState<'context' | 'memory' | 'personalize'>('context')
  const [memories, setMemories] = useState<AdvisorMemory[]>([])
  const [profile, setProfile] = useState<AdvisorProfile | null>(null)
  const [newMemoryText, setNewMemoryText] = useState('')
  const [newInterest, setNewInterest] = useState('')

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

  // ── Companion Brain: memories + profile (Advisor Companion Plan Phase 1) ──

  const loadMemories = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/advisor/memories`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { memories: AdvisorMemory[] }
      setMemories(data.memories)
    } catch {}
  }, [token])

  const loadProfile = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/advisor/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { profile: AdvisorProfile }
      setProfile(data.profile)
    } catch {}
  }, [token])

  useEffect(() => { loadMemories(); loadProfile() }, [loadMemories, loadProfile])

  // ── "Zuri Noticed Something" (Advisor Companion Plan Phase 4.5, §7.7) ────

  const [companionFeed, setCompanionFeed] = useState<CompanionFeedItem[]>([])

  const loadCompanionFeed = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`${API_URL}/api/advisor/companion-feed?status=pending`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json() as { items: CompanionFeedItem[] }
      setCompanionFeed(data.items.filter(i => i.kind === 'gossip'))
    } catch {}
  }, [token])

  useEffect(() => { loadCompanionFeed() }, [loadCompanionFeed])

  const dismissCompanionFeedItem = async (id: string) => {
    setCompanionFeed(prev => prev.filter(i => i.id !== id))
    if (!token) return
    try {
      await fetch(`${API_URL}/api/advisor/companion-feed/${id}/dismiss`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }

  const tellMeMoreAboutGossip = (item: CompanionFeedItem) => {
    setCompanionFeed(prev => prev.filter(i => i.id !== item.id))
    setCompanionMode('gossip')
    sendMessage(`What's going on with ${item.contactName ?? 'them'}? I noticed: ${item.summary}`)
  }

  const patchProfile = async (patch: Partial<AdvisorProfile>) => {
    if (!token) return
    try {
      await fetch(`${API_URL}/api/advisor/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      })
      setProfile(prev => prev ? { ...prev, ...patch } : prev)
    } catch {}
  }

  const addMemory = async () => {
    if (!token || !newMemoryText.trim()) return
    try {
      const res = await fetch(`${API_URL}/api/advisor/memories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          memoryType: 'preference',
          memoryKey: `manual_${Date.now()}`,
          memoryValue: newMemoryText.trim(),
        }),
      })
      if (!res.ok) return
      const data = await res.json() as { memory: AdvisorMemory }
      setMemories(prev => [data.memory, ...prev])
      setNewMemoryText('')
    } catch {}
  }

  const forgetMemory = async (id: string) => {
    if (!token) return
    setMemories(prev => prev.filter(m => m.id !== id))
    try {
      await fetch(`${API_URL}/api/advisor/memories/${id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }

  const addInterest = async () => {
    if (!newInterest.trim() || !profile) return
    const interests = [...profile.interests, newInterest.trim()]
    setNewInterest('')
    await patchProfile({ interests })
  }

  const removeInterest = async (interest: string) => {
    if (!profile) return
    await patchProfile({ interests: profile.interests.filter(i => i !== interest) })
  }

  const togglePersonalMode = async () => {
    if (!profile) return
    await patchProfile({ personalModeEnabled: !profile.personalModeEnabled })
  }

  // ── Companion mode chips ──────────────────────────────────────────────────

  const changeCompanionMode = async (mode: string) => {
    setCompanionMode(mode)
    if (!token || !activeSessionId) return
    try {
      await fetch(`${API_URL}/api/advisor/sessions/${activeSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ companionMode: mode }),
      })
    } catch {}
  }

  const createSession = async (title?: string): Promise<AdvisorSession | null> => {
    if (!token) return null
    try {
      const res = await fetch(`${API_URL}/api/advisor/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title ?? 'New conversation', companionMode }),
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
    setCompanionMode(sess.companion_mode ?? 'balanced')
    setLastAssistantState(null)
    setSidebarOpen(false)
    await loadSessionMessages(sess.id)
  }

  const startNewChat = async () => {
    setMessages([])
    setActiveSessionId(null)
    setCompanionMode('balanced')
    setLastAssistantState(null)
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

      const data = await res.json() as {
        message: { id: string; role: string; content: string; created_at: string }
        assistantState?: AssistantState | null
        memorySuggestion?: { key: string; value: string } | null
      }
      const answerText = data.message.content
      if (data.assistantState) {
        setLastAssistantState(data.assistantState)
        setCompanionMode(data.assistantState.companionMode)
      }
      if (data.memorySuggestion) loadMemories()

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
  }, [loading, token, activeSessionId, loadSessions, loadMemories, companionMode])

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
    if (!genRes.ok) {
      const body = await genRes.json().catch(() => ({ error: 'Failed to generate document' }))
      throw new ApiError(genRes.status, body.error || 'Failed to generate document')
    }
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

        {/* COMPANION MODE CHIPS — Advisor Companion Plan Phase 1 (§4.4/§7.2) */}
        {/* <div className="flex-shrink-0 border-b border-white/80 bg-white/60 px-3 md:px-6 py-2 overflow-x-auto backdrop-blur-xl">
          <div className="flex items-center gap-1.5 w-max">
            {COMPANION_MODES.map(mode => (
              <button
                key={mode.key}
                onClick={() => changeCompanionMode(mode.key)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                  companionMode === mode.key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-500 ring-1 ring-slate-100 hover:bg-slate-50'
                }`}
              >
                {mode.label}
              </button>
            ))}
            {profile?.spiritualPreferences?.tradition && (
              <button
                onClick={() => changeCompanionMode('spiritual_companion')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-colors ${
                  companionMode === 'spiritual_companion'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-500 ring-1 ring-slate-100 hover:bg-slate-50'
                }`}
              >
                Spiritual companion
              </button>
            )}
            {lastAssistantState && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[10px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
                <Smile className="w-3 h-3" /> reading: {lastAssistantState.mood}
              </span>
            )}
          </div>
        </div> */}

        {/* "Zuri Noticed Something" — Advisor Companion Plan Phase 4.5 (§3.7/§6.9/§7.7) */}
        {companionFeed.length > 0 && (
          <div className="px-3 pt-3 md:px-6 md:pt-4">
            <div className="mx-auto max-w-3xl space-y-2">
              {companionFeed.map(item => (
                <div key={item.id}
                  className="flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/80 px-3.5 py-3 shadow-sm shadow-violet-100/60">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500">Zuri noticed something</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-violet-900">{item.summary}</p>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => tellMeMoreAboutGossip(item)}
                        className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-violet-700 transition-colors">
                        Tell me more
                      </button>
                      <button onClick={() => dismissCompanionFeedItem(item.id)}
                        className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-violet-500 hover:text-violet-700 transition-colors">
                        Not now
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <div className="absolute bottom-1 left-3 right-3 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1 pointer-events-auto">
                  <button className="px-2 text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-50 transition-colors" title="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button className="px-2 text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-50 transition-colors" title="Voice input">
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
        <div className="p-3 border-b border-slate-200 flex items-center justify-between flex-shrink-0 gap-1">
          <div className="flex items-center gap-1 flex-1">
            {([
              { key: 'context', label: 'Context', Icon: Sliders },
              { key: 'memory', label: 'Memory', Icon: BookHeart },
              { key: 'personalize', label: 'Personalize', Icon: UserCog },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setInspectorTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-colors ${
                  inspectorTab === t.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <t.Icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <button onClick={() => setInspectorOpen(false)} className="p-1 text-slate-500 hover:text-slate-950 xl:hidden"><X className="w-4 h-4" /></button>
        </div>

        {inspectorTab === 'context' && (
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
        )}

        {/* MEMORY DRAWER — Advisor Companion Plan Phase 1 (§3.4/§7.3) */}
        {inspectorTab === 'memory' && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">What Zuri remembers about you</label>
              <div className="flex gap-1.5 mb-3">
                <input
                  type="text" value={newMemoryText} onChange={e => setNewMemoryText(e.target.value)}
                  placeholder="Remember something..."
                  onKeyDown={e => { if (e.key === 'Enter') addMemory() }}
                  className="flex-1 text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-300"
                />
                <button onClick={addMemory} disabled={!newMemoryText.trim()} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold disabled:opacity-40">Save</button>
              </div>
              {memories.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-4 text-center">Nothing yet — Zuri learns as you chat, or add something yourself above.</p>
              ) : (
                <div className="space-y-1.5">
                  {memories.map(m => (
                    <div key={m.id} className="bg-white border border-slate-100 rounded-2xl p-2.5 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[9px] font-bold uppercase tracking-wide text-indigo-500">{m.memoryType.replace(/_/g, ' ')}</span>
                          <p className="text-xs text-slate-700 leading-snug mt-0.5">{m.memoryValue}</p>
                        </div>
                        <button onClick={() => forgetMemory(m.id)} title="Forget this" className="p-1 text-slate-500 hover:text-rose-500 flex-shrink-0">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PERSONALISATION TAB (hidden, discovery-only) — §7.6 */}
        {inspectorTab === 'personalize' && profile && (
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
            <div className="bg-gradient-to-br from-indigo-50 to-cyan-50 border border-indigo-100 rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-950">Personal Mode</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Unlocks gossip, interests, and check-ins right away instead of waiting for Zuri to notice you want them.</p>
                </div>
                <button
                  onClick={togglePersonalMode}
                  className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${profile.personalModeEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${profile.personalModeEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Interests</label>
              <div className="flex gap-1.5 mb-2">
                <input
                  type="text" value={newInterest} onChange={e => setNewInterest(e.target.value)}
                  placeholder="e.g. Formula 1, stocks..."
                  onKeyDown={e => { if (e.key === 'Enter') addInterest() }}
                  className="flex-1 text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-300"
                />
                <button onClick={addInterest} disabled={!newInterest.trim()} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold disabled:opacity-40">Add</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.map(interest => (
                  <span key={interest} className="inline-flex items-center gap-1 bg-white border border-slate-100 rounded-full px-2.5 py-1 text-[10px] text-slate-700 shadow-sm">
                    {interest}
                    <button onClick={() => removeInterest(interest)}><X className="w-3 h-3 text-slate-500 hover:text-rose-500" /></button>
                  </span>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Spiritual companion</label>
              <select
                value={profile.spiritualPreferences?.tradition ?? ''}
                onChange={e => patchProfile({ spiritualPreferences: { ...profile.spiritualPreferences, tradition: e.target.value || undefined } })}
                className="w-full text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-indigo-300"
              >
                <option value="">Off (no faith-based content)</option>
                <option value="christian">Christian</option>
              </select>
            </div>
          </div>
        )}

        <div className="p-4 bg-white border-t border-slate-200 text-[10px] text-slate-500 flex items-center gap-2 flex-shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 text-indigo-500/80" />
          <span>Your data stays private</span>
        </div>
      </div>
    </div>
  )
}
