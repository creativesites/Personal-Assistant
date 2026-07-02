'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  Brain, MessageSquare, Send, Search, Pin, FileText, BarChart3, 
  Sparkles, CheckCircle2, User, ChevronRight, X, Sliders, 
  Calendar, Layers, Paperclip, Mic, HelpCircle, ArrowUpRight, 
  Bot, AlertCircle, TrendingUp, Zap, Clock, Users, ShieldAlert, Check
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'

// --- TYPE DEFINITIONS & CONTEXT SCHEMA ---
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  workspaceMode?: 'Business' | 'Hybrid' | 'Personal'
  componentType?: 'kpi_dashboard' | 'contact_card' | 'whatsapp_preview' | 'analytics_chart' | 'automation_wizard' | 'source_list'
  componentData?: any
}

interface ChatSession {
  id: string
  title: string
  category: 'Today' | 'Yesterday' | 'Pinned' | 'Saved Reports'
  unread?: boolean
}

// --- PREMIUM MOCK DATA ENGINE ---
const MOCK_CHAT_HISTORY: ChatSession[] = [
  { id: 'chat-1', title: 'Grace Clothing Pricing Barrier', category: 'Pinned' },
  { id: 'chat-2', title: 'June Conversion Bottlenecks', category: 'Pinned' },
  { id: 'chat-3', title: 'Follow-ups: Blue Jersey Inventory', category: 'Today', unread: true },
  { id: 'chat-4', title: 'Daily Activity Executive Summary', category: 'Today' },
  { id: 'chat-5', title: 'Ad-hoc Campaign: Inactive VIPs', category: 'Yesterday' },
  { id: 'chat-6', title: 'Sales Performance Assessment', category: 'Saved Reports' },
]

const SUGGESTED_CHIPS = [
  { label: '📊 Analyze June Conversion Drops', query: 'Why are sales down this week and what objections occur most?' },
  { label: '⚡ Review Hot Leads Strategy', query: 'Which leads are closest to converting and need attention?' },
  { label: '🎯 Draft WhatsApp Retention Campaign', query: 'Draft a promotional follow-up for inactive VIP customers' },
  { label: '🤖 Optimize Automation Rules', query: 'Show me my active follow-up automations or create a new one' }
]

// --- MAIN ADVISOR INTERFACE COMPONENT ---
export default function AdvisorPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  // Structural State Hooks
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [workspaceMode, setWorkspaceMode] = useState<'Business' | 'Hybrid' | 'Personal'>('Business')
  const [activeSessionId, setActiveSessionId] = useState('chat-1')
  const [searchTerm, setSearchTerm] = useState('')
  
  // Interactive Live Side-Panel Controller
  const [inspectorData, setInspectorData] = useState<any>({
    type: 'global_summary',
    title: 'System Intelligence Layer',
    healthScore: 94,
    leadScore: 88,
    metrics: { pipeline: 'K82,400', responseTime: '2m 31s', activeLeads: 18 }
  })

  // Command Menu UX Overlays
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [showMentionMenu, setShowMentionMenu] = useState(false)
  const [isRecording, setIsRecording] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading, scrollToBottom])

  // Contextual Automation Simulation Helper
  const triggerDemoSequence = (userText: string) => {
    const textLower = userText.toLowerCase()
    let responsePayload: Partial<Message> = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      timestamp: new Date(),
      content: 'Processing context metrics...'
    }

    if (textLower.includes('sales') || textLower.includes('conversion') || textLower.includes('analyze')) {
      responsePayload = {
        ...responsePayload,
        content: `I have performed a structural audit across your communication pipelines. Conversions show a marginal deviation due to price comparison friction on specific premium items.\n\nHere is your real-time operational status map:`,
        componentType: 'kpi_dashboard',
        componentData: {
          metrics: [
            { label: 'Active Pipeline', value: 'K82,400', change: '+16%', trend: 'up' },
            { label: 'Avg Response Time', value: '2m 31s', change: '-42s', trend: 'down' },
            { label: 'Hot Leads Unlocked', value: '7 Custom', change: 'Actionable', trend: 'neutral' },
            { label: 'Friction Rate', value: '14.2%', change: '+2%', trend: 'up' }
          ]
        }
      }
      setInspectorData({
        type: 'report_metrics',
        title: 'June Conversion Breakdown',
        healthScore: 89,
        leadScore: 74,
        insights: ['Price arguments dominate 68% of dropouts', 'Peak conversion velocity matches Friday payouts', 'MTN Money is preferred validation node'],
        sources: ['Pricing_Guide_v4.pdf', 'WhatsApp History (142 nodes)']
      })
    } else if (textLower.includes('lead') || textLower.includes('grace') || textLower.includes('closest')) {
      responsePayload = {
        ...responsePayload,
        content: `I identified high-intent engagement risks inside the pipeline. Specifically, Grace Clothing has been experiencing a pricing block over the last 7 days.\n\nHere is the target resolution card:`,
        componentType: 'contact_card',
        componentData: {
          name: 'Grace Clothing Operations',
          owner: 'Grace Tembo',
          leadScore: 92,
          revenue: 'K5,400',
          lastInteraction: '7 days ago',
          status: 'Needs Follow-up',
          objection: 'Budget / Distribution Costs'
        }
      }
      setInspectorData({
        type: 'contact_profile',
        title: 'Grace Clothing Core Profile',
        healthScore: 92,
        leadScore: 92,
        insights: ['Responds best to voice notes after 7 PM', 'Frequently cross-checks logistics parameters', 'High loyalty potential verified via tier classification'],
        sources: ['WhatsApp thread: Grace Tembo', 'Financial Ledger Matrix']
      })
    } else if (textLower.includes('campaign') || textLower.includes('draft') || textLower.includes('promotion')) {
      responsePayload = {
        ...responsePayload,
        content: `I have configured a targeted WhatsApp retention draft asset geared towards conversion acceleration. It highlights standard free installation benefits for higher tier buyers.`,
        componentType: 'whatsapp_preview',
        componentData: {
          customerName: 'Inactive VIP Cluster',
          previewMessage: '⚡ Zuri Special Access: Hi! We noticed you are finalizing your distribution array. Just a reminder that all purchases over K5,000 unlock fully subsidized free delivery and expert installation automatically this month.',
          confidence: '91%',
          abandonedContext: 'Argentina & World Cup Inventory Streams'
        }
      }
    } else {
      responsePayload = {
        ...responsePayload,
        content: `I have searched the Zuri Knowledge Base, connected WhatsApp threads, and active CRM variables. Let me know if you would like me to build an automation rule or pull an analytical funnel for this context.`,
        componentType: 'source_list',
        componentData: {
          sources: ['System Database Matrix', 'Operational Rules Engine', 'Global Configuration Sync']
        }
      }
    }

    setTimeout(() => {
      setMessages(prev => [...prev, responsePayload as Message])
      setLoading(false)
    }, 1100)
  }

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || loading) return

    const userMsg: Message = {  
      id: `u-${Date.now()}`,  
      role: 'user',  
      content: text.trim(),  
      timestamp: new Date(),
      workspaceMode
    }  

    setMessages(prev => [...prev, userMsg])  
    setInput('')  
    setLoading(true)  
    setShowSlashMenu(false)
    setShowMentionMenu(false)

    triggerDemoSequence(text)
  }, [loading, workspaceMode])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)

    // Command Activation Parsing Logic
    if (val.endsWith('/')) {
      setShowSlashMenu(true)
      setShowMentionMenu(false)
    } else if (val.endsWith('@')) {
      setShowMentionMenu(true)
      setShowSlashMenu(false)
    } else if (!val.includes('/') && !val.includes('@')) {
      setShowSlashMenu(false)
      setShowMentionMenu(false)
    }

    const el = e.target
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }

  const selectCommand = (command: string) => {
    setInput(prev => prev + command + ' ')
    setShowSlashMenu(false)
    inputRef.current?.focus()
  }

  const selectMention = (mention: string) => {
    setInput(prev => prev + mention + ' ')
    setShowMentionMenu(false)
    inputRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* 1. LEFT SIDEBAR PANEL: CONVERSATION TRAFFIC & REPOSITORY */}
      <div className="w-72 bg-slate-950 border-r border-slate-800 flex flex-col h-full flex-shrink-0 hidden lg:flex">
        
        {/* Workspace Initialization Segment */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <button 
            onClick={() => {
              setMessages([]);
              setInspectorData({
                type: 'global_summary',
                title: 'System Intelligence Layer',
                healthScore: 94,
                leadScore: 88,
                metrics: { pipeline: 'K82,400', responseTime: '2m 31s', activeLeads: 18 }
              });
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Sparkles className="w-3.5 h-3.5" />
            New Conversation
          </button>
          
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 text-xs rounded-xl pl-9 pr-4 py-2 text-slate-300 placeholder-slate-500 focus:outline-none focus:border-slate-700 transition-colors"
            />
          </div>
        </div>

        {/* History Scroll Deck Container */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4 custom-scrollbar">
          {(['Pinned', 'Today', 'Yesterday', 'Saved Reports'] as const).map(category => {
            const categoryChats = MOCK_CHAT_HISTORY.filter(c => c.category === category && c.title.toLowerCase().includes(searchTerm.toLowerCase()))
            if (categoryChats.length === 0) return null

            return (
              <div key={category} className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 flex items-center gap-1.5">
                  {category === 'Pinned' && <Pin className="w-2.5 h-2.5 text-indigo-400 fill-indigo-400" />}
                  {category === 'Today' && <Clock className="w-2.5 h-2.5 text-emerald-400" />}
                  {category === 'Yesterday' && <Layers className="w-2.5 h-2.5 text-slate-400" />}
                  {category === 'Saved Reports' && <BarChart3 className="w-2.5 h-2.5 text-amber-400" />}
                  {category}
                </p>
                <div className="space-y-0.5">
                  {categoryChats.map(chat => (
                    <button
                      key={chat.id}
                      onClick={() => {
                        setActiveSessionId(chat.id)
                        sendMessage(`Load contextual dossier regarding: ${chat.title}`)
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-all group ${
                        activeSessionId === chat.id 
                          ? 'bg-slate-800/80 text-white border border-slate-700/50 font-medium' 
                          : 'text-slate-400 hover:bg-slate-900/60 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${activeSessionId === chat.id ? 'text-indigo-400' : 'text-slate-500'}`} />
                        <span className="truncate">{chat.title}</span>
                      </div>
                      {chat.unread && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse flex-shrink-0 ml-1" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footprint Sync telemetry element */}
        <div className="p-3 bg-slate-950 border-t border-slate-850 text-[10px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Zuri Sync Engine Connected</span>
          </div>
          <span className="font-mono text-slate-600">v4.1-live</span>
        </div>
      </div>

      {/* 2. CENTER PANEL: ACTIVE CHAT FLUID WORKSPACE */}
      <div className="flex-1 flex flex-col h-full bg-slate-900 relative">
        
        {/* Dynamic Global Action Command Header */}
        <header className="h-16 border-b border-slate-800 bg-slate-950 px-4 md:px-6 flex items-center justify-between flex-shrink-0 z-20">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-white">AI Advisor Command</h1>
                <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Bot className="w-2.5 h-2.5" /> Core Agent
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">Unified context processing from internal database matrices</p>
            </div>
          </div>

          {/* Mode Switcher Matrices */}
          <div className="flex items-center gap-2">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-0.5 flex items-center">
              {(['Business', 'Hybrid', 'Personal'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setWorkspaceMode(mode)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    workspaceMode === mode 
                      ? 'bg-slate-800 text-white shadow-xs border border-slate-700/50' 
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Main Conversation Engine Feed */}
        <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 space-y-6 custom-scrollbar">
          {isEmpty ? (
            /* Dashboard Empty State View Layer */
            <div className="max-w-3xl mx-auto space-y-8 pt-4">
              <div className="bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                  <Brain className="w-36 h-36" />
                </div>
                <div className="space-y-2 max-w-xl">
                  <h2 className="text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                    Welcome back, Winston 👋
                  </h2>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Zuri has analyzed your connected enterprise engines, active CRM configurations, and automated interaction channels. Ask questions or run complex business queries directly.
                  </p>
                </div>

                {/* Grid Metric Layer Block */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-slate-800/60">
                  <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Users className="w-3 h-3 text-indigo-400" /> Customers Waiting
                    </div>
                    <p className="text-lg font-black text-white">18 Contacts</p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" /> Hot Leads Active
                    </div>
                    <p className="text-lg font-black text-white">7 Profiles</p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" /> Follow-ups Due
                    </div>
                    <p className="text-lg font-black text-white">5 Crucial</p>
                  </div>
                  <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl space-y-1">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-blue-400" /> Health Trend
                    </div>
                    <p className="text-lg font-black text-white">94% Index</p>
                  </div>
                </div>
              </div>

              {/* High-Impact Suggested Prompts Matrix */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Suggested Analytical Queries</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {SUGGESTED_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => sendMessage(chip.query)}
                      className="text-left p-3.5 bg-slate-950/60 hover:bg-slate-950 border border-slate-800 hover:border-slate-700/80 rounded-xl transition-all flex items-start gap-3 group"
                    >
                      <div className="text-xs font-medium text-slate-300 group-hover:text-white leading-snug">
                        {chip.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Hydrated Conversation Render Stack */
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map(msg => {
                const isUser = msg.role === 'user'
                return (
                  <div key={msg.id} className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
                    
                    {/* Assistant Profile Icon Layout */}
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-indigo-600 border border-indigo-500 flex items-center justify-center text-white text-xs font-black shadow-md flex-shrink-0 mt-1">
                        Z
                      </div>
                    )}

                    <div className={`space-y-3 max-w-[85%] ${isUser ? 'order-1' : 'order-2'}`}>
                      {/* Text Base Box */}
                      <div className={`rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                        isUser 
                          ? 'bg-indigo-600 text-white rounded-tr-xs font-medium' 
                          : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-tl-xs'
                      }`}>
                        {msg.content.split('\n').map((line, i) => (
                          <p key={i} className={i > 0 ? 'mt-1.5' : ''}>{line}</p>
                        ))}
                        
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/40">
                          <span className="text-[9px] text-slate-500">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {isUser && (
                            <span className="text-[9px] bg-indigo-700/60 px-1.5 py-0.5 rounded text-indigo-200 font-mono">
                              {msg.workspaceMode}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CONDITIONAL RENDER ENGINE: LUXURY INTERACTIVE COMPONENT LAYER */}
                      {!isUser && msg.componentType === 'kpi_dashboard' && (
                        <div className="grid grid-cols-2 gap-2.5 bg-slate-950 border border-slate-800 p-3 rounded-xl shadow-lg">
                          {msg.componentData?.metrics?.map((m: any, i: number) => (
                            <div key={i} className="bg-slate-900 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between">
                              <div>
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">{m.label}</p>
                                <p className="text-sm font-black text-white mt-0.5">{m.value}</p>
                              </div>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                m.trend === 'up' ? 'bg-emerald-500/10 text-emerald-400' :
                                m.trend === 'down' ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-400'
                              }`}>
                                {m.change}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {!isUser && msg.componentType === 'contact_card' && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3 shadow-lg">
                          <div className="flex items-start justify-between border-b border-slate-800 pb-2.5">
                            <div>
                              <p className="text-xs font-bold text-white">{msg.componentData?.name}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">Manager: {msg.componentData?.owner}</p>
                            </div>
                            <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black px-2 py-0.5 rounded">
                              Score: {msg.componentData?.leadScore}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            <div className="text-slate-400">Target Value: <span className="text-white font-bold">{msg.componentData?.revenue}</span></div>
                            <div className="text-slate-400">Last Synced: <span className="text-white font-medium">{msg.componentData?.lastInteraction}</span></div>
                            <div className="text-slate-400 col-span-2">Flag: <span className="text-rose-400 font-bold">⚠️ {msg.componentData?.objection}</span></div>
                          </div>

                          {/* Quick Interactive Workspace Action Links */}
                          <div className="flex gap-2 pt-1 border-t border-slate-850">
                            <button className="flex-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-[10px] font-bold py-1.5 rounded-lg transition-colors text-slate-300">
                              Open Chat Window
                            </button>
                            <button className="flex-1 bg-indigo-600/90 hover:bg-indigo-600 text-[10px] font-bold py-1.5 rounded-lg transition-colors text-white">
                              Resolve Objection
                            </button>
                          </div>
                        </div>
                      )}

                      {!isUser && msg.componentType === 'whatsapp_preview' && (
                        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-3 shadow-lg max-w-md">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> WhatsApp Broadcast Blueprint
                            </span>
                            <span className="text-slate-500">Confidence: {msg.componentData?.confidence}</span>
                          </div>
                          
                          {/* Embedded WhatsApp Bubble Rendering */}
                          <div className="bg-slate-900 border border-slate-850 rounded-xl p-3 relative">
                            <p className="text-[11px] text-slate-300 leading-relaxed italic">
                              {msg.componentData?.previewMessage}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 justify-end text-[10px] pt-1">
                            <button className="px-2.5 py-1 text-slate-400 hover:text-slate-200 font-medium">Ignore</button>
                            <button className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded-lg transition-all flex items-center gap-1">
                              <Check className="w-3 h-3" /> Approve & Transmit
                            </button>
                          </div>
                        </div>
                      )}

                      {!isUser && msg.componentType === 'source_list' && (
                        <div className="flex flex-wrap gap-1.5 items-center">
                          <span className="text-[10px] text-slate-500 font-bold uppercase mr-1">Validated Channels:</span>
                          {msg.componentData?.sources?.map((s: string, i: number) => (
                            <span key={i} className="bg-slate-950 text-slate-400 border border-slate-850 text-[10px] px-2 py-0.5 rounded-md font-medium flex items-center gap-1">
                              <FileText className="w-2.5 h-2.5 text-indigo-400" /> {s}
                            </span>
                          ))}
                        </div>
                      )}

                    </div>
                  </div>
                )
              })}
              {loading && (
                <div className="flex gap-4 justify-start items-center">
                  <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-xs font-black animate-pulse">
                    Z
                  </div>
                  <div className="bg-slate-950 border border-slate-850 rounded-2xl px-4 py-2.5 shadow-sm">
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Floating Context Autocomplete Menus */}
        {showSlashMenu && (
          <div className="absolute bottom-20 left-4 md:left-8 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-1.5 w-60 z-30 space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">Slash Context Trigger Commands</p>
            {['/contact', '/chat', '/report', '/knowledge', '/automation', '/calendar'].map(cmd => (
              <button 
                key={cmd}
                onClick={() => selectCommand(cmd)}
                className="w-full text-left text-xs px-2 py-1.5 text-slate-300 hover:bg-slate-900 rounded-lg transition-colors font-mono"
              >
                {cmd}
              </button>
            ))}
          </div>
        )}

        {showMentionMenu && (
          <div className="absolute bottom-20 left-4 md:left-8 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl p-1.5 w-60 z-30 space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1">Target Entity Mentions</p>
            {['@Grace_Clothing', '@Peter_Banda', '@June_Pricing_PDF', '@Sales_Funnel_Data'].map(men => (
              <button 
                key={men}
                onClick={() => selectMention(men)}
                className="w-full text-left text-xs px-2 py-1.5 text-slate-300 hover:bg-slate-900 rounded-lg transition-colors"
              >
                {men}
              </button>
            ))}
          </div>
        )}

        {/* Input Interactive Dashboard Bar Control Console */}
        <div className="bg-slate-950 border-t border-slate-850 p-4 flex-shrink-0 z-20">
          <div className="max-w-3xl mx-auto space-y-2">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-2 focus-within:border-slate-700 focus-within:bg-slate-900/90 transition-all shadow-inner relative">
              
              <textarea  
                ref={inputRef}  
                value={input}  
                onChange={handleInput}  
                onKeyDown={handleKeyDown}  
                placeholder="Ask Zuri anything, use '/' for system paths or '@' to link entities..."  
                rows={1}  
                className="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 resize-none focus:outline-none px-2 pt-2 pb-10 min-h-[44px] custom-scrollbar"  
                style={{ maxHeight: '140px' }}  
              />  

              {/* Functional Bottom Row Access Options Inside Composer */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                <div className="flex items-center gap-1 pointer-events-auto">
                  <button 
                    type="button"
                    className="p-2 text-slate-500 hover:text-slate-300 rounded-xl hover:bg-slate-850 transition-colors"
                    title="Attach Documentation Node"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => setIsRecording(!isRecording)}
                    className={`p-2 rounded-xl transition-all ${isRecording ? 'text-rose-400 bg-rose-500/10 animate-pulse' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-850'}`}
                    title="Voice Interface Input Capture"
                  >
                    <Mic className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[9px] text-slate-600 font-mono px-1.5 hidden sm:inline">
                    {input.includes('/') ? 'Command Mode Active' : input.includes('@') ? 'Entity Scope Attached' : ''}
                  </span>
                </div>

                <button  
                  onClick={() => sendMessage(input)}  
                  disabled={!input.trim() || loading}  
                  className="pointer-events-auto w-8 h-8 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md"
                >  
                  <Send className="w-3.5 h-3.5" />  
                </button>  
              </div>

            </div>
            
            <div className="flex justify-between items-center px-1 text-[10px] text-slate-500">
              <span>Press <kbd className="bg-slate-900 px-1 rounded text-slate-400">Enter</kbd> to execute · <kbd className="bg-slate-900 px-1 rounded text-slate-400">Shift+Enter</kbd> for manual breaks</span>
              {isRecording && <span className="text-rose-400 font-bold flex items-center gap-1">● Audio Pipeline Active</span>}
            </div>
          </div>
        </div>

      </div>

      {/* 3. RIGHT SIDEBAR PANEL: LIVE CONTEXT INTELLIGENCE ENGINE */}
      <div className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col h-full flex-shrink-0 hidden xl:flex">
        
        {/* Header Indicator */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
            <Sliders className="w-3 h-3 text-indigo-400" /> Live Data Monitor
          </p>
          <span className="text-[9px] bg-slate-900 border border-slate-800 text-slate-400 px-2 py-0.5 rounded-md font-mono">
            Active Layer
          </span>
        </div>

        {/* Dynamic Context Block Metrics Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar text-xs">
          
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Context Scope Focused</label>
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl space-y-2">
              <p className="font-bold text-white text-xs">{inspectorData.title}</p>
              
              <div className="flex items-center gap-4 text-[11px] pt-1">
                <div>
                  <span className="text-slate-400">Health Index:</span>
                  <span className="text-emerald-400 font-bold ml-1">{inspectorData.healthScore}%</span>
                </div>
                <div>
                  <span className="text-slate-400">Lead Matrix:</span>
                  <span className="text-indigo-400 font-bold ml-1">{inspectorData.leadScore}/100</span>
                </div>
              </div>
            </div>
          </div>

          {/* AI Automated Insight Ledger Blocks */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Real-time AI Observation</label>
            <div className="space-y-2">
              {(inspectorData.insights ?? [
                'Winston has active processing thresholds registered inside Namibia configurations',
                'High pipeline density shifts toward distribution verification steps',
                'WhatsApp text strings reveal high conversion intent drops over delivery margins'
              ]).map((insight: string, idx: number) => (
                <div key={idx} className="bg-slate-900/40 border border-slate-850 p-2.5 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                  <p className="text-slate-300 leading-relaxed text-[11px] font-medium">{insight}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Connected Data Infrastructure Validation Nodes */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Connected Infrastructure Nodes</label>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl divide-y divide-slate-850">
              {(inspectorData.sources ?? ['WhatsApp Pipeline Matrix', 'Enterprise Knowledge File Root', 'Active Core CRM Sync']).map((source: string, idx: number) => (
                <div key={idx} className="p-2.5 flex items-center justify-between text-[11px]">
                  <span className="text-slate-300 truncate font-medium mr-2">{source}</span>
                  <span className="text-[9px] text-emerald-400 font-mono bg-emerald-500/5 px-1.5 py-0.5 rounded border border-emerald-500/10">Active</span>
                </div>
              ))}
            </div>
          </div>

          {/* Contextual System Tasks Engine Section */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Suggested Tasks Pending Verification</label>
            <div className="space-y-1.5">
              <div className="p-2.5 bg-slate-900 border border-slate-850 rounded-xl flex items-center justify-between group">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <span className="text-slate-300 truncate text-[11px]">Review price barrier text rules</span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-white transition-colors" />
              </div>
              <div className="p-2.5 bg-slate-900 border border-slate-850 rounded-xl flex items-center justify-between group">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                  <span className="text-slate-300 truncate text-[11px]">Authorize pending VIP promotions</span>
                </div>
                <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-white transition-colors" />
              </div>
            </div>
          </div>

        </div>

        {/* Global Protection Node Badge footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-850 flex items-center gap-2 text-[10px] text-slate-500">
          <ShieldAlert className="w-3.5 h-3.5 text-indigo-500/80" />
          <span>Operational Security Environment Active</span>
        </div>
      </div>

    </div>
  )
}
