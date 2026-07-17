'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Search, ChevronLeft, Zap, X, MessageSquare,
  AlertCircle, Archive, StickyNote, ExternalLink,
  Flame, Activity, Brain, WifiOff, UserX, ChevronDown, Users,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Avatar, EmptyState, SkeletonListItem, useToast } from '@/components/ui'
import { ReplyDock } from './_components/reply-dock'
import { MessageThread } from './_components/message-thread'
import type { AIInsight } from './_components/inline-ai-card'
import { ConvRow } from './_components/conversation-row'
import { DailyBriefing } from './_components/daily-briefing'
import { SyncBanner } from './_components/sync-banner'
import { IntelPanel, type AITab } from './_components/intel-panel'
import type {
  Contact, ContactDetail, Conversation, Message, Suggestion,
  InternalNote, ContactPromise, ConvContext, BriefingData, BriefingInsight,
} from './_types/inbox'
import { AI_PRIORITY, FILTERS } from './_lib/constants'

type MobileView = 'list' | 'thread' | 'intel'
type FilterId = typeof FILTERS[number]['id']

interface SyncState {
  active: boolean
  done: boolean
  phase: 'idle' | 'importing' | 'analysing' | 'complete' | 'failed' | 'cancelled'
  jobId?: string | null
  processedMessages?: number
  totalMessages?: number
  processedConversations?: number
  totalConversations?: number
  currentChatName?: string | null
  conversationId?: string | null
}

function parseSocketPayload<T>(payload: T | string): T {
  return typeof payload === 'string' ? JSON.parse(payload) as T : payload
}

function sortConversations(list: Conversation[]) {
  return [...list].sort((a, b) => {
    if (a.unreadCount > 0 && b.unreadCount === 0) return -1
    if (a.unreadCount === 0 && b.unreadCount > 0) return 1
    const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
    const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
    return bt - at
  })
}

function upsertConversation(list: Conversation[], conversation: Conversation) {
  const index = list.findIndex(c => c.id === conversation.id)
  const next = index === -1 ? [conversation, ...list] : [...list.slice(0, index), conversation, ...list.slice(index + 1)]
  return sortConversations(next)
}

export default function InboxPage() {
  const session = useZuriSession()
  const token = session.data?.accessToken
  const mode = session.data?.mode ?? 'business'
  const userName = (session.data?.user?.email ?? '').split('@')[0] || 'there'
  const { addToast } = useToast()

  // Data
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [threadError, setThreadError] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(false)

  // Briefing
  const [briefingItems, setBriefingItems] = useState<string[]>([])
  const [briefingInsights, setBriefingInsights] = useState<BriefingInsight[]>([])
  const [briefingLoading, setBriefingLoading] = useState(false)

  // Context
  const [contextData, setContextData] = useState<ConvContext | null>(null)
  const [loadingContext, setLoadingContext] = useState(false)

  // UI
  const [mobileView, setMobileView] = useState<MobileView>('list')
  const [showAIPanel, setShowAIPanel] = useState(true)
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [filter, setFilter] = useState<FilterId>('all')
  const [aiTab, setAiTab] = useState<AITab>('overview')
  const [briefingDismissed, setBriefingDismissed] = useState(false)
  const [draft, setDraft] = useState('')
  const [newNote, setNewNote] = useState('')
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [editingSuggId, setEditingSuggId] = useState<string | null>(null)
  const [editedText, setEditedText] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [promises, setPromises] = useState<ContactPromise[]>([])

  // AI Actions
  const [showAIActions, setShowAIActions] = useState(false)
  const [aiActionLoading, setAIActionLoading] = useState<string | null>(null)
  const [aiActionResult, setAIActionResult] = useState<{ label: string; text: string } | null>(null)
  const [aiAskInput, setAIAskInput] = useState('')

  // Analysis
  const [analysing, setAnalysing] = useState(false)

  // Default Assistant widget (docs/AUTO_REPLY_AGENTS_PLAN.md §5/§7) — always
  // visible in the list header regardless of which conversation is open, so
  // auto-reply state is never buried behind a conversation selection.
  interface DefaultAgentSummary {
    id: string
    name: string
    avatarEmoji: string
    isActive: boolean
    trustLevel: 'observe' | 'suggest' | 'assisted' | 'delegated' | 'autonomous'
  }
  const [defaultAgent, setDefaultAgent] = useState<DefaultAgentSummary | null>(null)
  const [showAgentPanel, setShowAgentPanel] = useState(false)
  const AUTO_REPLY_MODES = [
    { key: 'off',        label: "Off",                    isActive: false, trustLevel: 'suggest' as const },
    { key: 'suggest',    label: 'Draft only',              isActive: true,  trustLevel: 'suggest' as const },
    { key: 'assisted',   label: 'Draft + auto-send',       isActive: true,  trustLevel: 'assisted' as const },
    { key: 'delegated',  label: 'Auto-send',                isActive: true,  trustLevel: 'delegated' as const },
    { key: 'autonomous', label: 'Fully autonomous',         isActive: true,  trustLevel: 'autonomous' as const },
  ] as const
  const currentAgentMode = !defaultAgent?.isActive
    ? 'off'
    : (AUTO_REPLY_MODES.find(m => m.trustLevel === defaultAgent.trustLevel && m.isActive)?.key ?? 'suggest')

  const loadDefaultAgent = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ agent: DefaultAgentSummary }>('/api/agents/default', { token })
      setDefaultAgent(data.agent)
    } catch { /* ignore */ }
  }, [token])

  const setAgentMode = async (key: typeof AUTO_REPLY_MODES[number]['key']) => {
    if (!token || !defaultAgent) return
    const mode = AUTO_REPLY_MODES.find(m => m.key === key)
    if (!mode) return
    const prev = defaultAgent
    setDefaultAgent({ ...defaultAgent, isActive: mode.isActive, trustLevel: mode.trustLevel })
    try {
      await apiClient('/api/agents/default', {
        method: 'PATCH', token,
        body: JSON.stringify({ is_active: mode.isActive, trust_level: mode.trustLevel }),
      })
    } catch {
      setDefaultAgent(prev)
    }
  }

  // Per-contact exclusion (plan §4) — surfaced right where you're looking
  // at the contact's conversation, since that's the natural place to act
  // on "don't auto-reply to this specific person."
  const [excludedContacts, setExcludedContacts] = useState<Map<string, string>>(new Map())

  const loadExcludedContacts = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ contacts: { id: string; contactId: string }[] }>(
        '/api/settings/auto-response/exclusions', { token },
      )
      setExcludedContacts(new Map(data.contacts.map(c => [c.contactId, c.id])))
    } catch { /* ignore */ }
  }, [token])

  const toggleContactExclusion = async () => {
    if (!token || !contact) return
    const existingId = excludedContacts.get(contact.id)
    try {
      if (existingId) {
        await apiClient(`/api/settings/auto-response/exclusions/${existingId}`, { method: 'DELETE', token })
        setExcludedContacts(prev => { const next = new Map(prev); next.delete(contact.id); return next })
      } else {
        const created = await apiClient<{ id: string }>('/api/settings/auto-response/exclusions', {
          method: 'POST', token, body: JSON.stringify({ contactId: contact.id }),
        })
        setExcludedContacts(prev => new Map(prev).set(contact.id, created.id))
      }
    } catch { /* ignore */ }
  }

  // Business OS Phase E (docs/BUSINESS_OS_PLAN.md §15) — bumped whenever a
  // 'bundle:ready' socket event arrives, so ActionBundlesSection (inside
  // IntelPanel) knows to refetch even if the contact is already open.
  const [bundleRefreshTick, setBundleRefreshTick] = useState(0)

  // Sync progress
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const [syncConvCount, setSyncConvCount] = useState(0)
  const [syncState, setSyncState] = useState<SyncState>({ active: false, done: false, phase: 'idle' })
  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedIdRef = useRef<string | null>(null)
  const selectedMsgIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadConversations = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ conversations: Conversation[] }>('/api/conversations', { token })
      setConversations(data.conversations)
      setSyncConvCount(data.conversations.length)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [token])

  const loadBriefing = useCallback(async () => {
    if (!token) return
    setBriefingLoading(true)
    try {
      const data = await apiClient<BriefingData>('/api/inbox/briefing', { token })
      setBriefingItems(data.items ?? [])
      setBriefingInsights(data.insights ?? [])
    } catch {} finally {
      setBriefingLoading(false)
    }
  }, [token])

  const loadContext = useCallback(async (convId: string) => {
    if (!token) return
    setLoadingContext(true)
    setContextData(null)
    try {
      const data = await apiClient<{ context: ConvContext }>(`/api/conversations/${convId}/context`, { token })
      setContextData(data.context)
    } catch {} finally {
      setLoadingContext(false)
    }
  }, [token])

  const loadSyncStatus = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ sync: null | {
        jobId: string
        status: string
        phase?: SyncState['phase']
        totalConversations?: number
        processedConversations?: number
        totalMessages?: number
        processedMessages?: number
        currentChatName?: string | null
        completedAt?: string | null
      } }>('/api/inbox/sync-status', { token })
      const sync = data.sync
      if (!sync) {
        setSyncState({ active: false, done: false, phase: 'idle' })
        setSyncing(false)
        return
      }
      const done = sync.status === 'completed'
      const active = sync.status === 'running' || sync.status === 'pending'
      setSyncState({
        active,
        done,
        phase: done ? 'complete' : sync.phase ?? (active ? 'analysing' : 'idle'),
        jobId: sync.jobId,
        totalConversations: sync.totalConversations,
        processedConversations: sync.processedConversations,
        totalMessages: sync.totalMessages,
        processedMessages: sync.processedMessages,
        currentChatName: sync.currentChatName,
      })
      setSyncing(active)
      setSyncDone(done && Boolean(sync.completedAt))
    } catch {}
  }, [token])

  useEffect(() => {
    const defaultTitle = 'Inbox | Zuri'
    document.title = totalUnread > 0 ? `(${totalUnread}) ${defaultTitle}` : defaultTitle
    return () => {
      document.title = defaultTitle
    }
  }, [totalUnread])

  useEffect(() => {
    if (!token) return
    loadConversations()
    loadBriefing()
    loadSyncStatus()
    loadDefaultAgent()
    loadExcludedContacts()
    const socket = getSocket(token)
    if (!socket) return

    const handleNewMessage = (payload: string) => {
      try {
        const data = parseSocketPayload<{
          messageId: string
          conversationId: string
          contactId: string
          senderType: 'user' | 'contact'
          messageType: string
          body: string | null
          mediaUrl?: string | null
          mediaMimeType?: string | null
          transcription?: string | null
          quotedMessageId?: string | null
          senderDisplayName?: string | null
          timestamp: string
        }>(payload)

        const isCurrentActive = selectedIdRef.current === data.conversationId

        // 1. If it belongs to the active conversation, append it in real-time
        if (isCurrentActive) {
          setMessages(prev => {
            // Avoid duplicates
            if (prev.some(m => m.id === data.messageId)) return prev

            // Filter out temporary local messages with the same body
            let filtered = prev
            if (data.senderType === 'user') {
              filtered = prev.filter(m => !(m.id.startsWith('temp-') && m.body === data.body))
            }

            const newMsg: Message = {
              id: data.messageId,
              senderType: data.senderType,
              messageType: data.messageType,
              body: data.body,
              timestamp: data.timestamp,
              pendingSuggestions: 0,
              mediaUrl: data.mediaUrl ?? null,
              mediaMimeType: data.mediaMimeType ?? null,
              transcription: data.transcription ?? null,
              quotedMessageId: data.quotedMessageId ?? null,
              senderDisplayName: data.senderDisplayName ?? null,
            }
            return [...filtered, newMsg]
          })

          // Mark read in database (fire-and-forget)
          if (data.senderType === 'contact') {
            apiClient(`/api/conversations/${data.conversationId}/read`, { method: 'POST', token }).catch(() => {})
          }
        }

        // 2. Update the conversation list locally (move to top, update preview, update unread count)
        setConversations(prev => {
          const index = prev.findIndex(c => c.id === data.conversationId)
          if (index === -1) {
            // If the conversation is not in our list, reload to fetch it
            loadConversations()
            return prev
          }

          const target = { ...prev[index] }
          target.lastMessageAt = data.timestamp

          const MEDIA_PREVIEW: Record<string, string> = {
            image: '📷 Photo',
            audio: '🎵 Voice message',
            video: '🎬 Video',
            document: '📄 Document',
            sticker: '🎨 Sticker',
            location: '📍 Location',
            contact_card: '👤 Contact',
          }
          target.lastMessagePreview = data.body || MEDIA_PREVIEW[data.messageType] || 'New message'

          if (!isCurrentActive && data.senderType === 'contact') {
            target.unreadCount = target.lastMessageAt === data.timestamp
              ? Math.max(target.unreadCount, 1)
              : target.unreadCount + 1
          } else {
            target.unreadCount = 0
          }

          const updatedList = [...prev]
          updatedList.splice(index, 1)
          return sortConversations([target, ...updatedList])
        })
      } catch (err) {
        console.error('[inbox] error handling new message:', err)
      }
    }

    socket.on('message:new', handleNewMessage)

    const handleConversationUpsert = (payload: string | { conversation: Conversation }) => {
      try {
        const data = parseSocketPayload<{ conversation: Conversation }>(payload)
        if (!data.conversation) return
        setConversations(prev => upsertConversation(prev, data.conversation))
        if (selectedIdRef.current === data.conversation.id) {
          setContact(prev => prev ?? data.conversation.contact)
        }
      } catch (err) {
        console.error('[inbox] error handling conversation upsert:', err)
      }
    }

    const handleConversationRead = (payload: string | { conversationId: string; unreadCount?: number }) => {
      try {
        const data = parseSocketPayload<{ conversationId: string; unreadCount?: number }>(payload)
        setConversations(prev => prev.map(c => (
          c.id === data.conversationId ? { ...c, unreadCount: data.unreadCount ?? 0 } : c
        )))
      } catch {}
    }

    socket.on('conversation:upsert', handleConversationUpsert)
    socket.on('conversation:read', handleConversationRead)

    const handleSyncProgress = (payload?: string | Partial<SyncState> & { status?: string; processed?: number; total?: number }) => {
      const data = payload ? parseSocketPayload<Partial<SyncState> & { status?: string; processed?: number; total?: number }>(payload) : {}
      const done = data.status === 'completed' || data.phase === 'complete'
      setSyncState(prev => ({
        ...prev,
        active: !done,
        done,
        phase: done ? 'complete' : data.phase ?? prev.phase ?? 'analysing',
        jobId: data.jobId ?? prev.jobId,
        processedMessages: data.processedMessages ?? data.processed ?? prev.processedMessages,
        totalMessages: data.totalMessages ?? data.total ?? prev.totalMessages,
        processedConversations: data.processedConversations ?? prev.processedConversations,
        totalConversations: data.totalConversations ?? prev.totalConversations,
        currentChatName: data.currentChatName ?? prev.currentChatName,
        conversationId: data.conversationId ?? prev.conversationId,
      }))
      setSyncing(!done)
      setSyncDone(done)
      loadConversations()
      if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current)
      if (syncDismissTimerRef.current) clearTimeout(syncDismissTimerRef.current)
      if (done) {
        loadConversations()
        syncDismissTimerRef.current = setTimeout(() => setSyncDone(false), 4000)
      }
    }
    socket.on('history:progress', handleSyncProgress)

    socket.on('suggestion:ready', (payload: string) => {
      try {
        const data = parseSocketPayload<{ messageId: string }>(payload)
        if (selectedIdRef.current && token) {
          apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${data.messageId}/suggestions`, { token })
            .then(d => { setSuggestions(d.suggestions); setSelectedMsgId(data.messageId) })
        }
        loadConversations()
      } catch {}
    })

    // Business OS Phase E — a detected multi-action bundle (docs/BUSINESS_OS_PLAN.md
    // §15). Platform Polish Phase 2 (docs/PLATFORM_POLISH_PLAN.md §4.1)
    // dropped the unconditional toast this used to fire on every detection
    // regardless of confidence — matching how reality.resolved/
    // suggestion:ready already behave silently. Just bump the refresh tick;
    // ActionBundlesSection refetches scoped to whatever contact is open (a
    // mismatch is a harmless no-op fetch), and the card itself is what the
    // user sees when they look.
    socket.on('bundle:ready', () => {
      setBundleRefreshTick(t => t + 1)
    })

    const reconcile = () => {
      loadConversations()
      loadSyncStatus()
      if (selectedIdRef.current) {
        const active = selectedIdRef.current
        apiClient<{ messages: Message[]; contact: Contact }>(`/api/conversations/${active}/messages`, { token })
          .then(data => {
            if (selectedIdRef.current !== active) return
            setMessages(data.messages)
            setContact(data.contact)
            setConversations(prev => prev.map(c => c.id === active ? { ...c, unreadCount: 0 } : c))
          })
          .catch(() => {})
      }
    }

    socket.on('authenticated', reconcile)
    socket.on('reconnect', reconcile)
    socket.io.on('reconnect', reconcile)

    // Default Assistant changes from Settings or the agent detail page
    // (docs/AUTO_REPLY_AGENTS_PLAN.md §5) — keep this widget in sync without
    // a manual refresh.
    socket.on('agent:default-updated', loadDefaultAgent)

    return () => {
      socket.off('message:new', handleNewMessage)
      socket.off('conversation:upsert', handleConversationUpsert)
      socket.off('conversation:read', handleConversationRead)
      socket.off('history:progress', handleSyncProgress)
      socket.off('suggestion:ready')
      socket.off('bundle:ready')
      socket.off('authenticated', reconcile)
      socket.off('reconnect', reconcile)
      socket.io.off('reconnect', reconcile)
      socket.off('agent:default-updated', loadDefaultAgent)
      if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current)
      if (syncDismissTimerRef.current) clearTimeout(syncDismissTimerRef.current)
    }
  }, [token, loadConversations, loadBriefing, loadSyncStatus, loadDefaultAgent, loadExcludedContacts])

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName
      const inField = tag === 'INPUT' || tag === 'TEXTAREA'
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowSearch(v => !v) }
      if (e.key === 'Escape') { setShowSearch(false) }
      if (e.key === 'r' && !inField && !e.metaKey && !e.ctrlKey) {
        if (selectedIdRef.current && selectedMsgIdRef.current && token) {
          setRegenerating(true); setSuggestions([])
          apiClient(`/api/messages/${selectedMsgIdRef.current}/regenerate`, { method: 'POST', token })
            .finally(() => setRegenerating(false))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [token])

  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])
  useEffect(() => { selectedMsgIdRef.current = selectedMsgId }, [selectedMsgId])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Actions ───────────────────────────────────────────────────────────────

  const selectConversation = async (convId: string) => {
    selectedIdRef.current = convId
    selectedMsgIdRef.current = null
    setSelectedId(convId); setSelectedMsgId(null); setSuggestions([])
    // Reset contact (not just contactDetail) on every switch — the sticky
    // header renders a skeleton while contact is null, so a stale contact
    // lingering from the previous conversation would otherwise flash the
    // wrong name/avatar before the new one loads.
    setContact(null); setContactDetail(null); setMessages([])
    setLoadingMsgs(true); setThreadError(false); setMobileView('thread')
    setDraft(''); setAiTab('overview'); setContextData(null); setPromises([])
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c))
    if (!token) return
    try {
      const data = await apiClient<{ messages: Message[]; contact: Contact }>(
        `/api/conversations/${convId}/messages`, { token }
      )
      if (selectedIdRef.current !== convId) return
      setMessages(data.messages); setContact(data.contact); setLoadingMsgs(false)
    if (data.contact?.id) {
      const contactId = data.contact.id
      apiClient<{ contact: ContactDetail }>(`/api/contacts/${contactId}`, { token })
        .then(d => setContactDetail(d.contact)).catch(() => {})
      apiClient<{ promises: ContactPromise[] }>(`/api/contacts/${contactId}/promises`, { token })
        .then(d => setPromises(d.promises ?? []))
        .catch(() => setPromises([]))
    }
    loadContext(convId)
    const last = [...data.messages].reverse().find(m => m.pendingSuggestions > 0)
    if (last) {
      setSelectedMsgId(last.id)
        apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${last.id}/suggestions`, { token })
          .then(d => setSuggestions(d.suggestions)).catch(() => {})
      }
    } catch {
      if (selectedIdRef.current !== convId) return
      setLoadingMsgs(false)
      setThreadError(true)
    }
  }

  const selectMessage = async (msgId: string) => {
    setSelectedMsgId(msgId)
    if (!token) return
    const data = await apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${msgId}/suggestions`, { token })
    setSuggestions(data.suggestions)
  }

  const approveSuggestion = async (id: string, customText?: string) => {
    if (!token) return
    setActionLoading(id)
    await apiClient(`/api/suggestions/${id}/approve`, {
      method: 'POST', token,
      ...(customText ? { body: JSON.stringify({ editedText: customText }) } : {}),
    })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    setActionLoading(null); setEditingSuggId(null)
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
    setRegenerating(true); setSuggestions([])
    await apiClient(`/api/messages/${selectedMsgId}/regenerate`, { method: 'POST', token })
    setRegenerating(false)
  }

  const sendDraft = async () => {
    if (!draft.trim() || !selectedId || !token) return
    const text = draft.trim(); setDraft('')
    const tempId = `temp-${Date.now()}`
    const tempMsg: Message = { id: tempId, senderType: 'user', messageType: 'text', body: text, timestamp: new Date().toISOString(), pendingSuggestions: 0 }
    setMessages(prev => [...prev, tempMsg])
    try {
      const data = await apiClient<{ message: Message; conversation?: Conversation }>(`/api/conversations/${selectedId}/messages`, { method: 'POST', token, body: JSON.stringify({ text }) })
      setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
      if (data.conversation) setConversations(prev => upsertConversation(prev, data.conversation!))
    } catch {}
  }

  const sendDirect = async (text: string) => {
    if (!text.trim() || !selectedId || !token) throw new Error('Cannot send')
    const tempId = `temp-${Date.now()}`
    const tempMsg: Message = { id: tempId, senderType: 'user', messageType: 'text', body: text.trim(), timestamp: new Date().toISOString(), pendingSuggestions: 0 }
    setMessages(prev => [...prev, tempMsg])
    const data = await apiClient<{ message: Message; conversation?: Conversation }>(`/api/conversations/${selectedId}/messages`, { method: 'POST', token, body: JSON.stringify({ text: text.trim() }) })
    setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
    if (data.conversation) setConversations(prev => upsertConversation(prev, data.conversation!))
  }

  const addNote = () => {
    if (!newNote.trim()) return
    setNotes(prev => [{ id: `n-${Date.now()}`, text: newNote.trim(), author: userName, createdAt: new Date().toISOString() }, ...prev])
    setNewNote('')
  }

  const approveProactive = async (id: string) => {
    if (!token) return
    setContactDetail(prev => prev ? { ...prev, proactiveSuggestions: prev.proactiveSuggestions.filter(s => s.id !== id) } : prev)
    try { await apiClient(`/api/proactive/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'approved' }) }) } catch {}
  }

  const snoozeProactive = async (id: string) => {
    if (!token) return
    setContactDetail(prev => prev ? { ...prev, proactiveSuggestions: prev.proactiveSuggestions.filter(s => s.id !== id) } : prev)
    const snoozedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    try { await apiClient(`/api/proactive/${id}`, { method: 'PATCH', token, body: JSON.stringify({ status: 'snoozed', snoozedUntil }) }) } catch {}
  }

  const aiSummarize = async () => {
    if (!selectedId || !token) return
    setAIActionLoading('summarize')
    try {
      const data = await apiClient<{ summary: string }>(`/api/conversations/${selectedId}/summarize`, { method: 'POST', token })
      setAIActionResult({ label: 'AI Summary', text: data.summary })
    } catch {
      setAIActionResult({ label: 'AI Summary', text: 'Could not generate summary. Make sure the intelligence service is running.' })
    } finally { setAIActionLoading(null) }
  }

  const aiFollowup = async () => {
    if (!selectedId || !token) return
    setAIActionLoading('followup')
    try {
      const data = await apiClient<{ followup: string }>(`/api/conversations/${selectedId}/followup`, { method: 'POST', token })
      setDraft(data.followup); setShowAIActions(false); setAIActionResult(null)
      setTimeout(() => draftRef.current?.focus(), 50)
    } catch {
      setAIActionResult({ label: 'Follow-up', text: 'Could not generate follow-up.' })
    } finally { setAIActionLoading(null) }
  }

  const aiAsk = async () => {
    if (!selectedId || !token || !aiAskInput.trim()) return
    const question = aiAskInput.trim()
    setAIActionLoading('ask'); setAIAskInput('')
    try {
      const data = await apiClient<{ answer: string }>(`/api/conversations/${selectedId}/ask`, {
        method: 'POST', token, body: JSON.stringify({ question }),
      })
      setAIActionResult({ label: `Q: ${question.slice(0, 40)}${question.length > 40 ? '…' : ''}`, text: data.answer })
    } catch {
      setAIActionResult({ label: 'Ask AI', text: 'Could not get an answer.' })
    } finally { setAIActionLoading(null) }
  }

  const runFullAnalysis = async () => {
    if (!selectedId || !token) return
    setAnalysing(true)
    try {
      await apiClient<{ queuedMessages: number }>(
        `/api/conversations/${selectedId}/analyze`,
        { method: 'POST', token, body: JSON.stringify({ scope: 'all', includeProfile: true, includeSuggestions: true }) },
      )
      // Refresh context + contact detail after triggering
      setTimeout(() => {
        loadContext(selectedId)
        if (contact?.id) {
          apiClient<{ contact: ContactDetail }>(`/api/contacts/${contact.id}`, { token }).then(d => setContactDetail(d.contact)).catch(() => {})
          apiClient<{ promises: ContactPromise[] }>(`/api/contacts/${contact.id}/promises`, { token }).then(d => setPromises(d.promises ?? [])).catch(() => setPromises([]))
        }
      }, 3000)
    } catch {} finally {
      setAnalysing(false)
    }
  }

  const runHeaderAnalysis = async () => {
    if (!selectedId || !token) return
    setAnalysing(true)
    try {
      await apiClient(
        `/api/conversations/${selectedId}/analyze`,
        { method: 'POST', token, body: JSON.stringify({ scope: 'recent', includeProfile: true, includeSuggestions: true }) },
      )
      addToast({ variant: 'success', title: 'Analysis running — insights will update shortly' })
    } catch {
      addToast({ variant: 'error', title: 'Analysis failed — check that the intelligence service is running' })
    } finally {
      setAnalysing(false)
    }
  }

  const runManualAnalysis = async (scope: 'latest' | 'recent') => {
    if (!selectedId || !token) return
    const actionKey = scope === 'latest' ? 'analyze-latest' : 'analyze-recent'
    setAIActionLoading(actionKey)
    try {
      const data = await apiClient<{ queuedMessages: number; profileQueued: boolean; suggestionsEnabled: boolean }>(
        `/api/conversations/${selectedId}/analyze`,
        { method: 'POST', token, body: JSON.stringify({ scope, includeProfile: scope === 'recent', includeSuggestions: true }) },
      )
      setAIActionResult({
        label: scope === 'latest' ? 'Latest Message Queued' : 'Intelligence Refresh Queued',
        text: `${data.queuedMessages} message${data.queuedMessages === 1 ? '' : 's'} queued for analysis${data.profileQueued ? ' and profile refresh' : ''}. New suggestions and insights will appear when processing finishes.`,
      })
      loadContext(selectedId)
      if (contact?.id) {
        apiClient<{ contact: ContactDetail }>(`/api/contacts/${contact.id}`, { token }).then(d => setContactDetail(d.contact)).catch(() => {})
        apiClient<{ promises: ContactPromise[] }>(`/api/contacts/${contact.id}/promises`, { token }).then(d => setPromises(d.promises ?? [])).catch(() => setPromises([]))
      }
    } catch {
      setAIActionResult({ label: 'Analysis Failed', text: 'Could not queue analysis. Check that Redis and the intelligence worker are running.' })
    } finally { setAIActionLoading(null) }
  }


  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !search || c.contact.name.toLowerCase().includes(q) || (c.lastMessagePreview ?? '').toLowerCase().includes(q)
    if (!matchSearch) return false
    if (filter === 'unread')      return c.unreadCount > 0
    if (filter === 'needs_reply') return c.unreadCount > 0 || c.aiPriority === 'waiting'
    if (filter === 'hot_leads')   return c.aiPriority === 'hot_lead' || c.aiPriority === 'ready_to_buy'
    if (filter === 'vip')         return (c.leadScore ?? 0) > 80
    if (filter === 'waiting')     return c.aiPriority === 'waiting'
    if (filter === 'at_risk')     return c.sentiment === 'frustrated' || c.sentiment === 'angry' || c.aiPriority === 'dissatisfied'
    return true
  })

  const hotLeads = conversations.filter(c => c.aiPriority === 'hot_lead' || c.aiPriority === 'ready_to_buy').length
  const avgHealth = conversations.length > 0
    ? Math.round(conversations.reduce((s, c) => s + c.healthScore, 0) / conversations.length)
    : 0
  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const currentPriority = selectedConv?.aiPriority ? AI_PRIORITY[selectedConv.aiPriority] : null
  const CurrentPIcon = currentPriority?.icon ?? null

  const timelineInsights: AIInsight[] = []
  if (contextData?.buyingSignals?.length) {
    timelineInsights.push({ type: 'opportunity', text: contextData.buyingSignals[0] })
  }
  if (contextData?.dominantSentiment === 'frustrated' || contextData?.dominantSentiment === 'angry') {
    timelineInsights.push({ type: 'alert', text: `Sentiment shift detected — consider a more empathetic tone` })
  }

  const intelPanelProps = {
    contact, contactDetail, selectedConv, contextData, contextLoading: loadingContext,
    suggestions, regenerating, actionLoading, mode, notes, newNote,
    editingSuggId, editedText, aiTab, messages, noteRef,
    token, analysing,
    bundleRefreshTick,
    onTabChange: setAiTab,
    onApprove: approveSuggestion,
    onDismiss: dismissSuggestion,
    onRegenerate: regenerate,
    onSetDraft: setDraft,
    onAddNote: addNote,
    onNoteChange: setNewNote,
    onEditSugg: setEditingSuggId,
    onEditedTextChange: setEditedText,
    draftFocus: () => draftRef.current?.focus(),
    promises, onApproveProactive: approveProactive, onSnoozeProactive: snoozeProactive,
    onAnalyseFull: runFullAnalysis,
    onSendDirect: sendDirect,
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-stone-50">

      {/* Offline banner */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white text-xs font-medium text-center py-2 flex items-center justify-center gap-2">
          <WifiOff size={13} />
          You are offline — messages will be queued when you reconnect.
        </div>
      )}

      {/* ── Left: Conversation list ──────────────────────────────────────── */}
      <div className={`${mobileView !== 'list' ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[272px] border-r border-gray-200 flex-shrink-0 bg-white`}>

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-gray-900">Inbox</h1>
            {totalUnread > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(v => !v)}
              className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            >
              <Search size={15} />
            </button>
            <a
              href="/inbox/queue"
              className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Zap size={12} />
              Queue
            </a>
          </div>
        </div>

        {/* Default Assistant widget (docs/AUTO_REPLY_AGENTS_PLAN.md §7) —
            always visible here regardless of which conversation is open,
            unlike the old per-conversation-only toggle this replaces. */}
        {defaultAgent && (
          <div className="border-b border-gray-100 flex-shrink-0">
            <button
              onClick={() => setShowAgentPanel(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors"
            >
              <span className="text-base leading-none">{defaultAgent.avatarEmoji}</span>
              <span className="text-xs font-medium text-gray-700 flex-1 text-left truncate">{defaultAgent.name}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                defaultAgent.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {AUTO_REPLY_MODES.find(m => m.key === currentAgentMode)?.label ?? 'Off'}
              </span>
              <ChevronDown size={13} className={`text-gray-400 transition-transform ${showAgentPanel ? 'rotate-180' : ''}`} />
            </button>
            {showAgentPanel && (
              <div className="px-3 pb-2.5 space-y-1">
                {AUTO_REPLY_MODES.map(mode => (
                  <button
                    key={mode.key}
                    onClick={() => setAgentMode(mode.key)}
                    className={`w-full text-left text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
                      currentAgentMode === mode.key ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
                <a href="/settings?tab=auto_responses" className="block text-[11px] text-indigo-600 hover:text-indigo-700 px-2.5 pt-1">
                  Manage in Settings →
                </a>
              </div>
            )}
          </div>
        )}

        <SyncBanner
          syncing={syncing}
          done={syncDone}
          convCount={syncConvCount}
          phase={syncState.phase}
          processedMessages={syncState.processedMessages}
          totalMessages={syncState.totalMessages}
          processedConversations={syncState.processedConversations}
          totalConversations={syncState.totalConversations}
          currentChatName={syncState.currentChatName}
          onDismiss={() => {
            setSyncDone(false)
            setSyncState(prev => ({ ...prev, done: false }))
          }}
        />

        {/* Search */}
        {showSearch && (
          <div className="px-3 py-2 border-b border-gray-50 flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus type="search" value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search conversations…"
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-50 overflow-x-auto flex-shrink-0 no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                filter === f.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Stats bar */}
        {!loading && conversations.length > 0 && (
          <div className="flex items-center divide-x divide-gray-100 border-b border-gray-100 flex-shrink-0 px-3 py-2">
            <div className="flex items-center gap-1.5 flex-1 pr-3">
              <MessageSquare size={11} className="text-indigo-400" />
              <div>
                <p className="text-[9px] text-gray-400 leading-none">Unread</p>
                <p className="text-xs font-bold text-gray-900 leading-none mt-0.5">{totalUnread}</p>
              </div>
            </div>
            {mode !== 'personal' && (
              <div className="flex items-center gap-1.5 flex-1 px-3">
                <Flame size={11} className="text-red-400" />
                <div>
                  <p className="text-[9px] text-gray-400 leading-none">Hot leads</p>
                  <p className="text-xs font-bold text-gray-900 leading-none mt-0.5">{hotLeads}</p>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-1 pl-3">
              <Activity size={11} className="text-emerald-400" />
              <div>
                <p className="text-[9px] text-gray-400 leading-none">Avg health</p>
                <p className="text-xs font-bold text-gray-900 leading-none mt-0.5">{avgHealth}%</p>
              </div>
            </div>
          </div>
        )}

        {/* Daily briefing */}
        {!briefingDismissed && mode !== 'personal' && (
          <DailyBriefing name={userName} insights={briefingInsights} items={briefingItems} loading={briefingLoading} onDismiss={() => setBriefingDismissed(true)} onOpenConversation={selectConversation} />
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-3 space-y-1">{Array.from({ length: 7 }, (_, i) => <SkeletonListItem key={i} />)}</div>
          ) : error ? (
            <EmptyState
              icon={<AlertCircle size={30} className="text-gray-400" />}
              title="Couldn't load conversations"
              description="Check the API server."
              action={<button onClick={loadConversations} className="text-sm text-indigo-600 font-medium hover:underline">Retry</button>}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={28} className="text-gray-400" />}
              title={search ? 'No results' : filter !== 'all' ? 'None here' : 'No conversations yet'}
              description={search ? `No match for "${search}"` : filter !== 'all' ? 'Try a different filter.' : 'Connect WhatsApp to get started.'}
            />
          ) : (
            <div className="divide-y divide-gray-50/80">
              {filtered.map(conv => {
                const rowActive = syncState.active && (
                  syncState.conversationId === conv.id ||
                  Boolean(syncState.currentChatName && conv.contact.name === syncState.currentChatName)
                )
                return (
                  <ConvRow
                    key={conv.id}
                    conv={conv}
                    active={selectedId === conv.id}
                    onClick={() => selectConversation(conv.id)}
                    mode={mode}
                    syncing={rowActive && syncState.phase === 'importing'}
                    analysing={rowActive && syncState.phase === 'analysing'}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Center: Chat ─────────────────────────────────────────────────── */}
      <div className={`${mobileView === 'list' ? 'hidden md:flex' : mobileView === 'intel' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0 relative`}>
        {selectedId ? (
          <>
            {/* Sticky header — contact is null for a beat after selecting a
                conversation (and stays null on a load failure), so it
                renders a skeleton instead of the header simply vanishing. */}
            <div className="sticky top-0 z-50 flex items-center gap-3 px-4 h-16 border-b border-neutral-200/80 bg-white/90 backdrop-blur-md flex-shrink-0 shadow-[0_2px_12px_-4px_rgba(0,0,0,0.03)] transition-all">
              <button
                onClick={() => setMobileView('list')}
                className="md:hidden p-2 -ml-2 text-neutral-500 hover:text-neutral-800 rounded-xl hover:bg-neutral-100 transition-all"
              >
                <ChevronLeft size={20} />
              </button>
              {contact ? (
                <>
                  <div className="relative group cursor-pointer">
                    <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" className="ring-2 ring-indigo-500/10 group-hover:ring-indigo-500/30 transition-all duration-300" />
                    {!contact.isGroup && (
                      <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {contact.isGroup && <Users size={13} className="text-neutral-400 flex-shrink-0" />}
                      <p className="text-sm font-bold text-neutral-900 tracking-tight truncate">{contact.name}</p>
                      {currentPriority && CurrentPIcon && (
                        <span className={`hidden sm:inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border shadow-sm tracking-wide transition-all ${currentPriority.color}`}>
                          <CurrentPIcon size={9} />
                          {currentPriority.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs text-neutral-500 font-medium tracking-wide truncate">
                        {contact.isGroup ? 'Group chat' : contact.phone ?? contactDetail?.relationship?.type?.replace(/_/g, ' ') ?? 'WhatsApp'}
                      </p>
                      {syncState.active && (syncState.conversationId === selectedId || syncState.currentChatName === contact.name) && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          {syncState.phase === 'analysing' ? 'Analysing chat' : 'Syncing chat'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {/* Run Analysis button */}
                    <button
                      onClick={runHeaderAnalysis}
                      disabled={analysing || aiActionLoading === 'analyze-recent'}
                      title="Run analysis on recent messages"
                      className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all bg-gray-50 border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {(analysing || aiActionLoading === 'analyze-recent') ? (
                        <svg className="animate-spin w-3 h-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      ) : (
                        <Zap size={11} />
                      )}
                      Analyse
                    </button>
                    {/* Per-contact exclusion (plan §4/§7) — the natural place to
                        act on "don't auto-reply to this specific person" is
                        right here, looking at their conversation. The global
                        switch lives in the list header (always visible). */}
                    <button
                      onClick={toggleContactExclusion}
                      title={excludedContacts.has(contact.id) ? 'Excluded from auto-reply — click to re-include' : 'Exclude this contact from auto-reply'}
                      className={`hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                        excludedContacts.has(contact.id)
                          ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <UserX size={11} />
                      {excludedContacts.has(contact.id) ? 'Excluded' : 'Exclude'}
                    </button>
                    <button
                      className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-50 transition-all active:scale-95"
                      title="Add note"
                      onClick={() => { setShowAIPanel(true); setAiTab('memory'); setTimeout(() => noteRef.current?.focus(), 150) }}
                    >
                      <StickyNote size={17} strokeWidth={2} />
                    </button>
                    <a
                      href={`/contacts/${contact.id}`}
                      className="p-2 text-neutral-400 hover:text-neutral-700 rounded-xl hover:bg-neutral-50 transition-all active:scale-95"
                      title="View full profile"
                    >
                      <ExternalLink size={17} strokeWidth={2} />
                    </a>
                    <button
                      className="p-2 text-neutral-400 hover:text-amber-600 rounded-xl hover:bg-amber-50 transition-all active:scale-95"
                      title="Archive conversation"
                      onClick={async () => {
                        if (!selectedId || !token) return
                        try {
                          await apiClient(`/api/conversations/${selectedId}`, { method: 'PATCH', token, body: JSON.stringify({ is_archived: true }) })
                          setConversations(prev => prev.filter(c => c.id !== selectedId))
                          setSelectedId(null)
                        } catch {}
                      }}
                    >
                      <Archive size={17} strokeWidth={2} />
                    </button>
                    <button
                      onClick={() => setMobileView('intel')}
                      className="md:hidden flex items-center gap-1.5 ml-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-bold rounded-xl active:scale-95 transition-all"
                    >
                      <Brain size={12} className="fill-indigo-600/10" />
                      Intel
                    </button>
                    <button
                      onClick={() => setShowAIPanel(v => !v)}
                      className={`hidden md:flex p-2 rounded-xl transition-all active:scale-95 ${showAIPanel ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-50'}`}
                      title="AI Intelligence Panel"
                    >
                      <Brain size={17} strokeWidth={2} className={showAIPanel ? 'fill-indigo-600/10' : ''} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="h-3 w-32 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer" />
                    <div className="h-2.5 w-20 rounded-full bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%] animate-shimmer" />
                  </div>
                </div>
              )}
            </div>

            {/* Messages + intel row */}
            <div className="flex flex-1 min-h-0 relative overflow-hidden">
              {/* Message area */}
              <div
                className="relative flex flex-col flex-1 min-w-0 bg-[#eae6df]"
                style={{
                  backgroundImage: `url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRcOOTYXA0CTvrMSr432Cm0CcRcPnrwgCDh_EyC5T05SQ&s=10')`,
                  backgroundSize: '400px',
                  backgroundRepeat: 'repeat',
                }}
              >
                <div className="absolute inset-0 bg-[#f7f4ee]/90 pointer-events-none mix-blend-normal" />

                {threadError ? (
                  <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-white shadow-sm border border-gray-200 flex items-center justify-center">
                      <AlertCircle size={24} className="text-rose-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Couldn't load this conversation</p>
                      <p className="text-xs text-gray-500 mt-0.5">Something went wrong reaching the server.</p>
                    </div>
                    <button
                      onClick={() => selectConversation(selectedId)}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <MessageThread
                    messages={messages}
                    loading={loadingMsgs}
                    token={token}
                    selectedMsgId={selectedMsgId}
                    searchOpen={false}
                    searchQuery=""
                    searchMatches={[]}
                    activeSearchIndex={0}
                    messagesEndRef={messagesEndRef}
                    timelineInsights={timelineInsights}
                    onSearchChange={() => {}}
                    onCloseSearch={() => {}}
                    onPrevSearch={() => {}}
                    onNextSearch={() => {}}
                    onSelectMessage={selectMessage}
                  />
                )}

                <ReplyDock
                  suggestions={suggestions}
                  draft={draft}
                  draftRef={draftRef}
                  selectedMsgId={selectedMsgId}
                  regenerating={regenerating}
                  showAIActions={showAIActions}
                  aiActionLoading={aiActionLoading}
                  aiActionResult={aiActionResult}
                  aiAskInput={aiAskInput}
                  onDraftChange={setDraft}
                  onSendDraft={sendDraft}
                  onUseAIResult={(text) => { setDraft(text); setAIActionResult(null); setShowAIActions(false); setTimeout(() => draftRef.current?.focus(), 50) }}
                  onDismissAIResult={() => setAIActionResult(null)}
                  onToggleAIActions={() => { setShowAIActions(v => !v); setAIActionResult(null) }}
                  onSummarize={aiSummarize}
                  onFollowup={aiFollowup}
                  onAsk={aiAsk}
                  onAskInputChange={setAIAskInput}
                  onRegenerate={regenerate}
                  onAnalyzeLatest={() => runManualAnalysis('latest')}
                  onAnalyzeRecent={() => runManualAnalysis('recent')}
                />
              </div>

              {/* Right: Intelligence panel (desktop) */}
              {showAIPanel && contact && (
                <div className="hidden md:flex w-[320px] xl:w-[340px] border-l border-gray-200 flex-col flex-shrink-0 overflow-hidden">
                  <IntelPanel {...intelPanelProps} onClose={() => setShowAIPanel(false)} />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-stone-50">
            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center mb-4">
              <MessageSquare size={28} className="text-gray-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900 mb-1">Select a conversation</p>
            <p className="text-xs text-gray-500 mb-6">Choose from the list on the left.</p>
            <div className="flex items-center gap-5 text-xs text-gray-400">
              {[['⌘K', 'Search'], ['R', 'Regenerate'], ['⌘↵', 'Send']].map(([key, label]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-white border border-gray-200 rounded text-[10px] font-mono shadow-sm">{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile: Intel view ───────────────────────────────────────────── */}
      {mobileView === 'intel' && selectedId && contact && (
        <div className="md:hidden flex flex-col flex-1 min-w-0">
          <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 bg-white flex-shrink-0">
            <button onClick={() => setMobileView('thread')} className="p-2 -ml-2 text-gray-400 hover:text-gray-600 rounded-lg">
              <ChevronLeft size={20} />
            </button>
            <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{contact.name}</p>
              <p className="text-xs text-indigo-500 font-medium">{contact.isGroup ? 'Group chat — not analysed' : 'AI Intelligence'}</p>
            </div>
          </div>
          <div className="flex-1 overflow-hidden">
            <IntelPanel
              {...intelPanelProps}
              onSetDraft={text => { setDraft(text); setMobileView('thread') }}
              onClose={() => setMobileView('thread')}
              draftFocus={() => { setMobileView('thread'); setTimeout(() => draftRef.current?.focus(), 100) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
