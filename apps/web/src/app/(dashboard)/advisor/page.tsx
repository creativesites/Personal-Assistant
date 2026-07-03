'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Brain, Send, Search, Pin, FileText, BarChart3,
  Sparkles, CheckCircle2, ChevronRight, X, Sliders,
  Calendar, Layers, Paperclip, Mic, ArrowUpRight,
  Bot, AlertCircle, TrendingUp, Zap, Clock, Users, ShieldAlert,
  MessageSquare, Phone, Mail, Star, Edit3, ExternalLink,
  MoreHorizontal, Filter, Download, RefreshCw, Menu, PanelRight,
  ArrowLeft, Plus, Trash2, Copy, ThumbsUp, ThumbsDown
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'

// --- TYPE DEFINITIONS ---
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  componentType?: 'kpi_dashboard' | 'contact_card' | 'whatsapp_preview' | 'action_confirm' | 'source_list' | 'message_sent'
  componentData?: any
  feedback?: 'up' | 'down' | null
}

// --- DEMO DATA ---
const MOCK_CHAT_HISTORY = [
  { id: 'chat-1', title: 'Grace Clothing — Pricing Discussion', category: 'Pinned' as const, date: 'Today' },
  { id: 'chat-2', title: 'June Sales Performance Review', category: 'Pinned' as const, date: 'Today' },
  { id: 'chat-3', title: 'Follow‑up: Blue Jersey Stock', category: 'Today' as const, date: '2h ago', unread: true },
  { id: 'chat-4', title: 'Morning Business Summary', category: 'Today' as const, date: '5h ago' },
  { id: 'chat-5', title: 'Re‑engage Inactive VIPs', category: 'Yesterday' as const, date: 'Mon' },
  { id: 'chat-6', title: 'Monthly Revenue Report', category: 'Saved Reports' as const, date: 'Last week' },
]

const RECENT_CONTACTS = [
  { name: 'Grace Tembo', company: 'Grace Clothing', lastActive: '2h ago', unread: 3 },
  { name: 'Peter Banda', company: 'AutoFix Garage', lastActive: 'Yesterday', unread: 0 },
  { name: 'Mary Phiri', company: 'Sunrise Clinic', lastActive: 'Today', unread: 1 },
]

const SUGGESTED_CHIPS = [
  { icon: TrendingUp, label: 'How are sales this month?', query: 'Show me sales performance for June with conversion rates and top objections' },
  { icon: Users, label: 'Which leads need attention?', query: 'Which hot leads are closest to converting and need a follow‑up today?' },
  { icon: Zap, label: 'Draft a follow‑up campaign', query: 'Draft a WhatsApp message to re‑engage inactive VIP customers with a special offer' },
  { icon: Calendar, label: 'What\'s on my plate today?', query: 'Show me all pending follow‑ups, overdue replies, and tasks for today' },
  { icon: BarChart3, label: 'Analyze response times', query: 'How has our average response time changed this month and which contacts are waiting longest?' },
  { icon: MessageSquare, label: 'Send a message to Grace', query: 'Draft a friendly follow‑up to Grace Tembo about the pricing discussion from last week' },
]

// --- HELPER: Timestamp formatter ---
function timeAgo(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

// --- MAIN COMPONENT ---
export default function AdvisorPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  // State
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('chat-1')
  const [searchTerm, setSearchTerm] = useState('')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, loading])

  // --- DEMO RESPONSE ENGINE ---
  const triggerDemoSequence = (text: string) => {
    const lower = text.toLowerCase()
    let response: Message = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      timestamp: new Date(),
      content: 'I\'ve analyzed your request. Here\'s what I found:',
    }

    if (lower.includes('sales') || lower.includes('performance') || lower.includes('conversion')) {
      response = {
        ...response,
        content: 'Here\'s your sales performance snapshot for June. Conversions are steady but pricing objections are up 12%. I\'d recommend reviewing the pricing guide for top‑selling items.',
        componentType: 'kpi_dashboard',
        componentData: {
          metrics: [
            { label: 'Pipeline Value', value: 'K82,400', change: '+16%', trend: 'up' },
            { label: 'Avg Response', value: '2m 31s', change: '-42s', trend: 'down' },
            { label: 'Hot Leads', value: '7', change: '+3', trend: 'up' },
            { label: 'Conversion Rate', value: '24%', change: '-2%', trend: 'down' },
          ]
        }
      }
    } else if (lower.includes('lead') || lower.includes('attention') || lower.includes('converting')) {
      response = {
        ...response,
        content: 'I found 7 hot leads that need attention. Grace Clothing is your highest‑intent lead — they\'ve been discussing pricing for 7 days without a close.',
        componentType: 'contact_card',
        componentData: {
          name: 'Grace Clothing',
          contact: 'Grace Tembo',
          leadScore: 92,
          revenue: 'K5,400',
          lastInteraction: '7 days ago',
          status: 'Needs Follow‑up',
          phone: '+260 97 711 4490',
        }
      }
    } else if (lower.includes('draft') || lower.includes('message') || lower.includes('campaign') || lower.includes('grace')) {
      response = {
        ...response,
        content: 'I\'ve drafted a WhatsApp message for Grace. It references your last conversation about pricing and includes a soft call to action.',
        componentType: 'whatsapp_preview',
        componentData: {
          recipient: 'Grace Tembo',
          preview: 'Hi Grace! 👋 I was just reviewing our chat from last week about the jersey pricing. I wanted to check in — we\'ve got some flexible options I think could work for your budget. Would you be open to a quick call this week? Let me know what works best for you.',
          confidence: 94,
        }
      }
    } else if (lower.includes('today') || lower.includes('pending') || lower.includes('follow')) {
      response = {
        ...response,
        content: 'Here\'s what needs your attention today. You have 5 overdue follow‑ups and 3 customers who haven\'t been contacted in over a week.',
        componentType: 'action_confirm',
        componentData: {
          actions: [
            { title: 'Follow up with Grace Tembo', urgency: 'high', description: 'Pricing discussion — 7 days stale' },
            { title: 'Send invoice reminder to Peter Banda', urgency: 'medium', description: 'Overdue by 3 days' },
            { title: 'Check in with Mary Phiri', urgency: 'low', description: 'Last contact 10 days ago' },
          ]
        }
      }
    } else {
      response = {
        ...response,
        content: 'I\'ve searched across your WhatsApp conversations, CRM contacts, and knowledge base. Let me know if you\'d like me to draft a message, analyze a contact, or build an automation rule.',
        componentType: 'source_list',
        componentData: {
          sources: ['142 WhatsApp conversations', '18 CRM contacts', '3 uploaded documents', 'June analytics data']
        }
      }
    }

    setTimeout(() => {
      setMessages(prev => [...prev, response])
      setLoading(false)
    }, 1200)
  }

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: text.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setShowSlashMenu(false)
    setShowMentionMenu(false)
    triggerDemoSequence(text)
  }, [loading])

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

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* MOBILE SIDEBAR OVERLAY */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-slate-950 border-r border-slate-800 flex flex-col">
            {/* Sidebar content — same as desktop */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-white">Conversations</span>
              <button onClick={() => setSidebarOpen(false)} className="p-1 text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 space-y-3">
              <button onClick={() => { setMessages([]); setSidebarOpen(false) }} className="w-full bg-indigo-600 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2">
                <Sparkles className="w-3.5 h-3.5" /> New Chat
              </button>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 text-xs rounded-xl pl-9 pr-4 py-2 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-slate-700" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 space-y-4">
              {(['Pinned', 'Today', 'Yesterday', 'Saved Reports'] as const).map(cat => {
                const chats = MOCK_CHAT_HISTORY.filter(c => c.category === cat)
                if (!chats.length) return null
                return (
                  <div key={cat} className="space-y-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3">{cat}</p>
                    {chats.map(chat => (
                      <button key={chat.id} onClick={() => { setActiveSessionId(chat.id); sendMessage(`Load: ${chat.title}`); setSidebarOpen(false) }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all ${activeSessionId === chat.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'}`}>
                        <div className="flex items-center gap-2 truncate">
                          <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                          <span className="truncate">{chat.title}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* DESKTOP SIDEBAR */}
      <div className="w-72 bg-slate-950 border-r border-slate-800 flex-col h-full flex-shrink-0 hidden lg:flex">
        <div className="p-4 border-b border-slate-800 space-y-3">
          <button onClick={() => setMessages([])} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2">
            <Plus className="w-3.5 h-3.5" /> New Chat
          </button>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input type="text" placeholder="Search conversations..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-xs rounded-xl pl-9 pr-4 py-2 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-slate-700" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
          {(['Pinned', 'Today', 'Yesterday', 'Saved Reports'] as const).map(cat => {
            const chats = MOCK_CHAT_HISTORY.filter(c => c.category === cat && c.title.toLowerCase().includes(searchTerm.toLowerCase()))
            if (!chats.length) return null
            return (
              <div key={cat} className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 flex items-center gap-1.5">
                  {cat === 'Pinned' && <Pin className="w-2.5 h-2.5 text-indigo-400" />}
                  {cat === 'Today' && <Clock className="w-2.5 h-2.5 text-emerald-400" />}
                  {cat}
                </p>
                {chats.map(chat => (
                  <button key={chat.id} onClick={() => { setActiveSessionId(chat.id); sendMessage(`Load: ${chat.title}`) }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all group ${activeSessionId === chat.id ? 'bg-slate-800/80 text-white border border-slate-700/50' : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 border border-transparent'}`}>
                    <div className="flex items-center gap-2 truncate">
                      <MessageSquare className="w-3.5 h-3.5 flex-shrink-0 text-slate-500" />
                      <span className="truncate">{chat.title}</span>
                      {chat.unread && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 ml-auto flex-shrink-0" />}
                    </div>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
        <div className="p-3 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Connected</span>
          </div>
          <span className="font-mono text-slate-600">v4.1</span>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div className="flex-1 flex flex-col h-full bg-slate-900 relative min-w-0">
        
        {/* ── REDESIGNED HEADER ──────────────────────────────────── */}
        <header className="h-14 md:h-16 border-b border-slate-800 bg-slate-950 px-3 md:px-5 flex items-center justify-between flex-shrink-0 gap-2 z-20">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            {/* Mobile menu trigger */}
            <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-400 hover:text-white lg:hidden">
              <Menu className="w-5 h-5" />
            </button>
            
            {/* Logo + title */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-lg bg-white/5 p-0.5 flex items-center justify-center">
                <img src="https://tnznwohaezrslohtohep.supabase.co/storage/v1/object/public/assets/zuri%20(1).png" alt="Zuri" className="w-full h-full object-contain" />
              </div>
              <div className="hidden sm:block">
                <h4 className="text-sm font-bold text-white leading-tight">AI Advisor</h4>
                <p className="text-[10px] text-slate-500">Ask anything about your business</p>
              </div>
            </div>
          </div>

          {/* Header quick actions */}
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <button onClick={() => setMessages([])} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors">
              <Plus className="w-3.5 h-3.5" /> New
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors" title="Export chat">
              <Download className="w-4 h-4" />
            </button>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors" title="Refresh context">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={() => setInspectorOpen(!inspectorOpen)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-lg transition-colors xl:hidden" title="Context panel">
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── MESSAGES AREA ──────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6 space-y-5 custom-scrollbar">
          {isEmpty ? (
            /* Empty state */
            <div className="max-w-2xl mx-auto space-y-6 pt-2 md:pt-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 flex items-center justify-center mx-auto mb-3">
                  <Brain className="w-7 h-7 text-indigo-400" />
                </div>
                <h2 className="text-lg md:text-xl font-bold text-white">Your AI Business Assistant</h2>
                <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto leading-relaxed">
                  I have access to all your WhatsApp conversations, contacts, leads, and knowledge base. Ask me anything — draft messages, analyze performance, or find opportunities.
                </p>
              </div>

              {/* Quick stats row */}
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-lg md:text-xl font-bold text-white">142</p>
                  <p className="text-[10px] text-slate-400">Chats indexed</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-lg md:text-xl font-bold text-white">18</p>
                  <p className="text-[10px] text-slate-400">Contacts tracked</p>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                  <p className="text-lg md:text-xl font-bold text-white">7</p>
                  <p className="text-[10px] text-slate-400">Hot leads</p>
                </div>
              </div>

              {/* Suggested prompts */}
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
            /* Messages */
            <div className="max-w-2xl mx-auto space-y-5">
              {messages.map(msg => {
                const isUser = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">Z</div>
                    )}
                    <div className={`space-y-2 max-w-[88%] ${isUser ? 'order-1' : 'order-2'}`}>
                      {/* Message bubble */}
                      <div className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${isUser ? 'bg-indigo-600 text-white' : 'bg-slate-950 border border-slate-800 text-slate-200'}`}>
                        {msg.content}
                        <div className="text-[9px] text-slate-500 mt-1.5 flex items-center gap-2">
                          {timeAgo(msg.timestamp)}
                          {!isUser && (
                            <div className="flex items-center gap-1 ml-auto">
                              <button className="p-0.5 hover:text-white"><Copy className="w-3 h-3" /></button>
                              <button className="p-0.5 hover:text-emerald-400"><ThumbsUp className="w-3 h-3" /></button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* KPI Dashboard component */}
                      {!isUser && msg.componentType === 'kpi_dashboard' && msg.componentData?.metrics && (
                        <div className="grid grid-cols-2 gap-2 bg-slate-950 border border-slate-800 p-3 rounded-xl">
                          {msg.componentData.metrics.map((m: any, i: number) => (
                            <div key={i} className="bg-slate-900 border border-slate-800 p-2.5 rounded-lg">
                              <p className="text-[9px] text-slate-500 font-bold uppercase">{m.label}</p>
                              <p className="text-sm font-bold text-white">{m.value}</p>
                              <span className={`text-[10px] font-semibold ${m.trend === 'up' ? 'text-emerald-400' : m.trend === 'down' ? 'text-rose-400' : 'text-slate-400'}`}>{m.change}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Contact card component */}
                      {!isUser && msg.componentType === 'contact_card' && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-white">{msg.componentData.name}</p>
                            <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded">Score: {msg.componentData.leadScore}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                            <div>Contact: <span className="text-white">{msg.componentData.contact}</span></div>
                            <div>Value: <span className="text-white font-bold">{msg.componentData.revenue}</span></div>
                            <div>Last active: <span className="text-white">{msg.componentData.lastInteraction}</span></div>
                            <div>Status: <span className="text-amber-400 font-bold">{msg.componentData.status}</span></div>
                          </div>
                          <div className="flex gap-2 pt-1 border-t border-slate-800">
                            <button className="flex-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-bold py-1.5 rounded-lg text-slate-300">Open Chat</button>
                            <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-bold py-1.5 rounded-lg text-white">Send Message</button>
                          </div>
                        </div>
                      )}

                      {/* WhatsApp preview component */}
                      {!isUser && msg.componentType === 'whatsapp_preview' && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5 max-w-sm">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-emerald-400 font-bold">To: {msg.componentData.recipient}</span>
                            <span className="text-slate-500">Confidence: {msg.componentData.confidence}%</span>
                          </div>
                          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3">
                            <p className="text-[11px] text-slate-300 leading-relaxed italic">{msg.componentData.preview}</p>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button className="px-3 py-1.5 text-[10px] text-slate-400 hover:text-white font-medium">Edit</button>
                            <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Send Now
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action confirm component */}
                      {!isUser && msg.componentType === 'action_confirm' && msg.componentData?.actions && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                          {msg.componentData.actions.map((action: any, i: number) => (
                            <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-900 rounded-lg">
                              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${action.urgency === 'high' ? 'bg-rose-500' : action.urgency === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-white">{action.title}</p>
                                <p className="text-[10px] text-slate-400">{action.description}</p>
                              </div>
                              <button className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 flex-shrink-0">Do it →</button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Source list component */}
                      {!isUser && msg.componentType === 'source_list' && msg.componentData?.sources && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-[10px] text-slate-500 font-bold">Sources:</span>
                          {msg.componentData.sources.map((s: string, i: number) => (
                            <span key={i} className="bg-slate-950 text-slate-400 border border-slate-800 text-[10px] px-2 py-0.5 rounded-md">{s}</span>
                          ))}
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

        {/* ── SLASH / MENTION POPUPS ──────────────────────────────── */}
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

        {/* ── FIXED BOTTOM INPUT ──────────────────────────────────── */}
        <div className="flex-shrink-0 bg-slate-950 border-t border-slate-800 px-3 py-3 md:px-6 z-20">
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-slate-700 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Ask about sales, draft a message, or type / for commands..."
                rows={1}
                className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none focus:outline-none px-2 pt-1.5 pb-10 min-h-[44px]"
                style={{ maxHeight: '120px' }}
              />
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1 pointer-events-auto">
                  <button className="p-2 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-slate-800 transition-colors" title="Attach file">
                    <Paperclip className="w-4 h-4" />
                  </button>
                  <button onClick={() => setIsRecording(!isRecording)}
                    className={`p-2 rounded-lg transition-all ${isRecording ? 'text-rose-400 bg-rose-500/10' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`} title="Voice input">
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading}
                  className="pointer-events-auto w-9 h-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md">
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-2">
              Zuri can access your WhatsApp chats, contacts, and business data. <span className="text-slate-600">Always verify important info.</span>
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT INSPECTOR PANEL */}
      {(inspectorOpen || true) && (
        <div className={`w-80 bg-slate-950 border-l border-slate-800 flex-col h-full flex-shrink-0 ${inspectorOpen ? 'fixed right-0 top-0 bottom-0 z-40 xl:relative xl:z-0' : 'hidden xl:flex'}`}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Context
            </p>
            <button onClick={() => setInspectorOpen(false)} className="p-1 text-slate-400 hover:text-white xl:hidden"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Recent Contacts</label>
              <div className="space-y-2">
                {RECENT_CONTACTS.map((c, i) => (
                  <div key={i} className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-white">{c.name}</p>
                      <p className="text-[10px] text-slate-400">{c.company}</p>
                    </div>
                    {c.unread > 0 && <span className="bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">{c.unread}</span>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Quick Actions</label>
              <div className="space-y-1.5">
                {['Send broadcast', 'Export leads', 'Generate report', 'Update knowledge base'].map((a, i) => (
                  <button key={i} className="w-full text-left p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 hover:bg-slate-800 transition-colors flex items-center gap-2">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> {a}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="p-4 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-indigo-500/80" />
            <span>Your data stays private</span>
          </div>
        </div>
      )}
    </div>
  )
      }
