'use client'

import { contactLabel, formatPhone, isPhoneLikeName } from '@/lib/phone'
import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Search, ChevronLeft, Zap, X, MessageSquare,
  AlertCircle, Archive, StickyNote, ExternalLink,
  WifiOff, UserX, ChevronDown, Users,
  Pencil, HelpCircle, ShieldCheck, CheckCircle2, RefreshCw, Trash2,
  MoreVertical, Settings, Clock,
} from 'lucide-react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { useGuidedTour, INBOX_TOUR_STEPS } from '@/components/guided-tour'
import { apiClient } from '@/lib/api'
import { getSocket } from '@/lib/socket'
import { Avatar, EmptyState, SkeletonListItem, useToast, Modal, Input, Button, ConfirmModal } from '@/components/ui'
import { useCelebration } from '@/hooks/use-celebration'
import { ChampagneConfettiCanvas, CelebrationBanner } from '@/components/ui/celebration-effects'
import { ReplyDock } from './_components/reply-dock'
import { MessageThread } from './_components/message-thread'
import { GroupParticipantsDrawer } from './_components/group-participants-drawer'
import { MediaLightbox, type LightboxItem } from './_components/media-lightbox'
import { Dropdown } from '@/components/ui/dropdown'
import { ZuriMark } from '@/components/ui/zuri-mark'
import { mediaHref } from './_components/message-content'
import { ProfilePictureModal } from './_components/profile-picture-modal'
import { StatusStoriesBar } from './_components/status-stories-bar'
import { StatusViewerModal } from './_components/status-viewer-modal'
import { PostStatusModal } from './_components/post-status-modal'
import { QuickDocModal } from './_components/quick-doc-modal'
import type { ContactStatusGroup } from '@zuri/types'
import type { AIInsight } from './_components/inline-ai-card'
import { ConvRow } from './_components/conversation-row'
import { DailyBriefing } from './_components/daily-briefing'
import { SyncBanner } from './_components/sync-banner'
import { type AITab } from './_components/intel-panel'
import { ZuriPanel } from './_components/zuri-panel/zuri-panel'
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
  phase: 'idle' | 'importing' | 'analysing' | 'complete' | 'failed' | 'cancelled' | 'skipped'
  jobId?: string | null
  processedMessages?: number
  totalMessages?: number
  processedConversations?: number
  totalConversations?: number
  currentChatName?: string | null
  conversationId?: string | null
}

function parseSocketPayload<T>(payload: T | string): T {
  try {
    const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
    if (parsed && typeof parsed === 'object' && 'payload' in parsed && 'seq' in parsed && 'event' in parsed) {
      const inner = (parsed as any).payload
      return typeof inner === 'string' ? JSON.parse(inner) as T : (inner as T)
    }
    return parsed as T
  } catch {
    return payload as unknown as T
  }
}

const CONV_PAGE_SIZE = 100

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

  const searchParams = useSearchParams()
  const urlContactId = searchParams?.get('contactId')
  const urlConvId = searchParams?.get('conversationId')

  const { activeCelebration, clearCelebration } = useCelebration()

  // Data
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [contact, setContact] = useState<Contact | null>(null)
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasMoreConvs, setHasMoreConvs] = useState(false)
  const [loadingMoreConvs, setLoadingMoreConvs] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [threadError, setThreadError] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [aiNotice, setAiNotice] = useState<{ type: 'warning' | 'error' | 'info'; text: string } | null>(null)
  const regenerateTimerRef = useRef<NodeJS.Timeout | null>(null)
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
  const chatSearchRef = useRef<HTMLInputElement>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [aiTab, setAiTab] = useState<AITab>('overview')
  const [briefingDismissed, setBriefingDismissed] = useState(() =>
    typeof window !== 'undefined' && localStorage.getItem('zuri.inbox.briefingHiddenOn') === new Date().toDateString())
  const dismissBriefingForToday = () => {
    localStorage.setItem('zuri.inbox.briefingHiddenOn', new Date().toDateString())
    setBriefingDismissed(true)
  }
  const [draft, setDraft] = useState('')
  const [newNote, setNewNote] = useState('')
  const [notes, setNotes] = useState<InternalNote[]>([])
  const [editingSuggId, setEditingSuggId] = useState<string | null>(null)
  const { startCustomTour } = useGuidedTour()
  const [editedText, setEditedText] = useState('')
  const [isOnline, setIsOnline] = useState(true)
  const [promises, setPromises] = useState<ContactPromise[]>([])
  const [dismissedCardIds, setDismissedCardIds] = useState<string[]>([])

  // Presence map state
  const [presenceMap, setPresenceMap] = useState<Record<string, { status: string; lastSeenAt: string | null }>>({})

  // Internal Notes & Lightbox states
  const [threadInternalNotes, setThreadInternalNotes] = useState<Array<{ id: string; text: string; author: string; createdAt: string }>>([])
  const [showInternalNoteModal, setShowInternalNoteModal] = useState(false)
  const [showQuickDocModal, setShowQuickDocModal] = useState(false)
  const [internalNoteInput, setInternalNoteInput] = useState('')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [enlargedAvatar, setEnlargedAvatar] = useState<{ id?: string; name: string; avatarUrl?: string | null; phone?: string | null; isGroup?: boolean } | null>(null)

  // Shared Inbox Team & Locking states
  const [teamMembers, setTeamMembers] = useState<Array<{ userId: string; fullName: string; email: string; role: string }>>([])
  const [selectedConvLock, setSelectedConvLock] = useState<{ lockedBy: string | null; lockedByName?: string } | null>(null)

  // Edit contact modal states
  const [showEditContact, setShowEditContact] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // In-thread search states
  const [threadSearchOpen, setThreadSearchOpen] = useState(false)

  // Queue depth & AI delayed monitoring
  const [queueHealth, setQueueHealth] = useState<{ queueDepth: number; aiDelayed: boolean }>({ queueDepth: 0, aiDelayed: false })

  useEffect(() => {
    if (!token) return
    const checkQueueHealth = async () => {
      try {
        const res = await apiClient<{ ok: boolean; queueDepth: number; aiDelayed: boolean }>('/api/system/queue-health', { token })
        if (res.ok) {
          setQueueHealth({ queueDepth: res.queueDepth, aiDelayed: res.aiDelayed })
        }
      } catch {
        // ignore error
      }
    }

    checkQueueHealth()
    const interval = setInterval(checkQueueHealth, 15000)
    return () => clearInterval(interval)
  }, [token])
  const [threadSearchQuery, setThreadSearchQuery] = useState('')
  const [threadActiveSearchIndex, setThreadActiveSearchIndex] = useState(0)

  // AI Actions
  const [showAIActions, setShowAIActions] = useState(false)
  const [aiActionLoading, setAIActionLoading] = useState<string | null>(null)
  const [aiActionResult, setAIActionResult] = useState<{ label: string; text: string } | null>(null)
  const [aiAskInput, setAIAskInput] = useState('')

  // Quoted reply & message forwarding states
  const [replyingToMessage, setReplyingToMessage] = useState<any | null>(null)
  const [forwardingMessage, setForwardingMessage] = useState<any | null>(null)
  const [groupDrawerOpen, setGroupDrawerOpen] = useState(false)

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

  // WhatsApp Statuses (Stories)
  const [statusGroups, setStatusGroups] = useState<ContactStatusGroup[]>([])
  const [selectedStatusGroup, setSelectedStatusGroup] = useState<ContactStatusGroup | null>(null)
  const [postStatusModalOpen, setPostStatusModalOpen] = useState(false)

  const loadStatuses = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ groups: ContactStatusGroup[] }>('/api/statuses', { token })
      setStatusGroups(data.groups || [])
    } catch { /* ignore */ }
  }, [token])

  useEffect(() => {
    if (token) loadStatuses()
  }, [token, loadStatuses])

  // Sync progress
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const [syncConvCount, setSyncConvCount] = useState(0)
  const [syncState, setSyncState] = useState<SyncState>({ active: false, done: false, phase: 'idle' })
  const syncDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // History import publishes progress continuously; reloading the whole
  // conversation list on every event hammered the API. Throttle to ~3s.
  const lastSyncReloadRef = useRef(0)

  const selectedIdRef = useRef<string | null>(null)
  const selectedMsgIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)

  // Team Member 60-Second Onboarding Tutorial Modal
  const [showTutorialModal, setShowTutorialModal] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const seen = localStorage.getItem('zuri_team_inbox_tutorial_seen')
      if (!seen) {
        setShowTutorialModal(true)
      }
    }
  }, [])

  const closeTutorialModal = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('zuri_team_inbox_tutorial_seen', 'true')
    }
    setShowTutorialModal(false)
  }

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0)

  // ── Data loading ──────────────────────────────────────────────────────────

  const conversationsLenRef = useRef(0)
  conversationsLenRef.current = conversations.length

  const loadMoreConversations = useCallback(async () => {
    if (!token) return
    setLoadingMoreConvs(true)
    try {
      const data = await apiClient<{ conversations: Conversation[]; hasMore?: boolean }>(
        `/api/conversations?limit=${CONV_PAGE_SIZE}&offset=${conversationsLenRef.current}`, { token },
      )
      setConversations(prev => {
        const seen = new Set(prev.map(c => c.id))
        return [...prev, ...data.conversations.filter(c => !seen.has(c.id))]
      })
      setHasMoreConvs(Boolean(data.hasMore))
    } catch {
      addToast({ variant: 'error', title: 'Couldn\'t load more conversations' })
    } finally {
      setLoadingMoreConvs(false)
    }
  }, [token, addToast])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const exitSelectMode = useCallback(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [])

  const bulkDeleteConversations = useCallback(async () => {
    if (!token || selectedIds.size === 0) return
    setBulkDeleting(true)
    try {
      const ids = Array.from(selectedIds)
      const res = await apiClient<{ deleted: number; ids: string[] }>('/api/conversations/bulk-delete', {
        method: 'POST', token, body: JSON.stringify({ ids }),
      })
      const gone = new Set(res.ids)
      setConversations(prev => prev.filter(c => !gone.has(c.id)))
      setSelectedId(prev => (prev && gone.has(prev) ? null : prev))
      addToast({ variant: 'success', title: `Deleted ${res.deleted} chat${res.deleted === 1 ? '' : 's'}` })
      setConfirmBulkDelete(false)
      exitSelectMode()
    } catch {
      addToast({ variant: 'error', title: 'Couldn\'t delete those chats' })
    } finally {
      setBulkDeleting(false)
    }
  }, [token, selectedIds, addToast, exitSelectMode])

  const loadConversations = useCallback(async () => {
    if (!token) return
    try {
      // Refresh keeps however many pages the user has already scrolled through.
      const limit = Math.min(Math.max(conversationsLenRef.current, CONV_PAGE_SIZE), 500)
      const data = await apiClient<{ conversations: Conversation[]; hasMore?: boolean }>(`/api/conversations?limit=${limit}`, { token })
      setConversations(data.conversations)
      setHasMoreConvs(Boolean(data.hasMore))
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

  const loadTeamMembers = useCallback(async () => {
    if (!token) return
    try {
      const data = await apiClient<{ team: { members: Array<{ userId: string; fullName: string; email: string; role: string }> } | null }>('/api/team', { token })
      if (data.team?.members) {
        setTeamMembers(data.team.members)
      }
    } catch {}
  }, [token])

  const assignConversation = useCallback(async (convId: string, assignedTo: string | null) => {
    if (!token) return
    const currentConv = conversations.find(c => c.id === convId)
    const expectedAssignedTo = currentConv?.assignedTo ?? null
    try {
      await apiClient(`/api/conversations/${convId}/assign`, {
        method: 'POST',
        token,
        body: JSON.stringify({ assignedTo, expectedAssignedTo }),
      })
      const member = teamMembers.find(m => m.userId === assignedTo)
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, assignedTo, assignedToEmail: member?.email ?? null } : c))
      addToast({ variant: 'success', title: assignedTo ? 'Conversation assigned' : 'Assignment cleared' })
    } catch (err: any) {
      if (err?.status === 409) {
        const winnerName = err?.data?.assignedToName || err?.data?.lockedByName || 'another team member'
        if (err?.data?.assignedTo) {
          const winnerId = err.data.assignedTo
          const member = teamMembers.find(m => m.userId === winnerId)
          setConversations(prev => prev.map(c => c.id === convId ? { ...c, assignedTo: winnerId, assignedToEmail: member?.email ?? null } : c))
        }
        addToast({
          variant: 'error',
          title: 'Assignment Conflict',
          description: `This conversation was claimed by ${winnerName}.`,
        })
      } else {
        addToast({ variant: 'error', title: 'Failed to assign conversation' })
      }
    }
  }, [token, conversations, teamMembers, addToast])

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
    loadTeamMembers()
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
            // Same timestamp as before this event = a duplicate delivery of the same message.
            target.unreadCount = prev[index].lastMessageAt === data.timestamp
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

    socket.on('message:reaction', (payload: string) => {
      try {
        const data = parseSocketPayload<{ conversationId: string; messageId: string; reactions: Array<{ emoji: string; count: number; userReacted: boolean }> }>(payload)
        if (selectedIdRef.current === data.conversationId) {
          setMessages(prev => prev.map(m => (
            m.id === data.messageId ? { ...m, reactions: data.reactions } : m
          )))
        }
      } catch {}
    })

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
      const cancelled = data.status === 'cancelled' || (data.phase as string) === 'skipped'
      if (cancelled) {
        setSyncing(false)
        setSyncDone(false)
        setSyncState(prev => ({ ...prev, active: false, phase: 'cancelled' }))
        return
      }
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
      const now = Date.now()
      if (!done && now - lastSyncReloadRef.current > 3000) {
        lastSyncReloadRef.current = now
        loadConversations()
      }
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
        if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current)
        setRegenerating(false)
        setAiNotice(null)
        const data = parseSocketPayload<{ messageId: string }>(payload)
        if (selectedIdRef.current && token) {
          apiClient<{ suggestions: Suggestion[] }>(`/api/messages/${data.messageId}/suggestions`, { token })
            .then(d => { setSuggestions(d.suggestions); setSelectedMsgId(data.messageId) })
        }
        loadConversations()
      } catch {}
    })

    socket.on('suggestion:failed', (payload: string) => {
      try {
        if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current)
        setRegenerating(false)
        const data = parseSocketPayload<{ messageId: string; error?: string; details?: string }>(payload)
        setAiNotice({ type: 'warning', text: data.error || 'AI draft unavailable — reply manually or retry' })
        setTimeout(() => draftRef.current?.focus(), 50)
      } catch {
        setRegenerating(false)
        setAiNotice({ type: 'warning', text: 'AI draft unavailable — reply manually or retry' })
      }
    })

    socket.on('byok:error', (payload: string) => {
      try {
        if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current)
        setRegenerating(false)
        const data = parseSocketPayload<{ provider: string; status?: number; error?: string }>(payload)
        setAiNotice({ type: 'error', text: data.error || `Your custom ${data.provider?.toUpperCase()} key returned an error. Please check your key in Settings.` })
        setTimeout(() => draftRef.current?.focus(), 50)
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

    const handlePresenceUpdate = (payload: string) => {
      try {
        const data = parseSocketPayload<{
          jid: string
          presence: 'available' | 'unavailable' | 'composing' | 'recording'
          lastSeenAt: string
        }>(payload)
        setPresenceMap(prev => ({
          ...prev,
          [data.jid]: {
            status: data.presence,
            lastSeenAt: data.lastSeenAt
          }
        }))
      } catch (err) {
        console.error('[inbox] error handling presence update:', err)
      }
    }

    const handleMessageStatusUpdate = (payload: string) => {
      try {
        const data = parseSocketPayload<{
          messageId: string
          conversationId: string
          deliveryStatus: 'sent' | 'delivered' | 'read'
        }>(payload)
        if (selectedIdRef.current === data.conversationId) {
          setMessages(prev => prev.map(m => (
            m.id === data.messageId ? { ...m, deliveryStatus: data.deliveryStatus } : m
          )))
        }
      } catch (err) {
        console.error('[inbox] error handling message status update:', err)
      }
    }

    const handleConversationAssigned = (payload: string) => {
      try {
        const data = parseSocketPayload<{
          conversationId: string
          assignedTo: string | null
          assignedToName?: string | null
          assignedToEmail?: string | null
          assignedBy?: string
          assignedByName?: string
          contactName?: string
        }>(payload)

        setConversations(prev => prev.map(c => c.id === data.conversationId
          ? {
              ...c,
              assignedTo: data.assignedTo,
              assignedToName: data.assignedToName ?? c.assignedToName,
              assignedToEmail: data.assignedToEmail ?? c.assignedToEmail,
            }
          : c
        ))

        const currentUserId = session.data?.user?.id
        const currentUserEmail = session.data?.user?.email
        const isAssignedToMe = Boolean(
          (currentUserId && data.assignedTo === currentUserId) ||
          (currentUserEmail && data.assignedToEmail === currentUserEmail)
        )

        if (isAssignedToMe && data.assignedBy !== currentUserId) {
          addToast({
            variant: 'info',
            title: 'Conversation Assigned',
            description: `${data.contactName || 'A conversation'} was assigned to you by ${data.assignedByName || 'a team member'}.`,
          })
        }
      } catch {}
    }

    const handleConversationLocked = (payload: string) => {
      try {
        const data = parseSocketPayload<{ conversationId: string; lockedBy: string; lockedByName?: string }>(payload)
        if (selectedIdRef.current === data.conversationId) {
          setSelectedConvLock({ lockedBy: data.lockedBy, lockedByName: data.lockedByName })
        }
        setConversations(prev => prev.map(c => c.id === data.conversationId ? { ...c, lockedBy: data.lockedBy } : c))
      } catch {}
    }

    const handleConversationUnlocked = (payload: string) => {
      try {
        const data = parseSocketPayload<{ conversationId: string }>(payload)
        if (selectedIdRef.current === data.conversationId) {
          setSelectedConvLock(null)
        }
        setConversations(prev => prev.map(c => c.id === data.conversationId ? { ...c, lockedBy: null } : c))
      } catch {}
    }

    socket.on('conversation:assigned', handleConversationAssigned)
    socket.on('conversation:locked', handleConversationLocked)
    socket.on('conversation:unlocked', handleConversationUnlocked)
    socket.on('presence:update', handlePresenceUpdate)
    socket.on('message:status:update', handleMessageStatusUpdate)

    const reconcile = () => {
      loadConversations()
      loadSyncStatus()
      loadTeamMembers()
      if (selectedIdRef.current) {
        const active = selectedIdRef.current
        apiClient<{ messages: Message[]; contact: Contact }>(`/api/conversations/${active}/messages`, { token })
          .then(data => {
            if (selectedIdRef.current !== active) return
            // Keep older pages the user already scrolled back through.
            const oldest = data.messages[0]?.timestamp
            setMessages(prev => oldest
              ? [...prev.filter(m => !m.id.startsWith('temp-') && m.timestamp < oldest), ...data.messages]
              : data.messages)
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
      socket.off('conversation:assigned', handleConversationAssigned)
      socket.off('conversation:locked', handleConversationLocked)
      socket.off('conversation:unlocked', handleConversationUnlocked)
      socket.off('history:progress', handleSyncProgress)
      socket.off('suggestion:ready')
      socket.off('bundle:ready')
      socket.off('presence:update', handlePresenceUpdate)
      socket.off('message:status:update', handleMessageStatusUpdate)
      socket.off('authenticated', reconcile)
      socket.off('reconnect', reconcile)
      socket.io.off('reconnect', reconcile)
      socket.off('agent:default-updated', loadDefaultAgent)
      if (syncDoneTimerRef.current) clearTimeout(syncDoneTimerRef.current)
      if (syncDismissTimerRef.current) clearTimeout(syncDismissTimerRef.current)
    }
  }, [token, loadConversations, loadBriefing, loadSyncStatus, loadDefaultAgent, loadExcludedContacts, loadTeamMembers])

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
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); chatSearchRef.current?.focus() }
      if (e.key === 'Escape') { setThreadSearchOpen(false) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        if (selectedIdRef.current) {
          e.preventDefault()
          setThreadSearchOpen(v => !v)
        }
      }
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

  useEffect(() => { selectedIdRef.current = selectedId; setLightboxIndex(null) }, [selectedId])

  // Phone back gesture/button: an open chat gets its own history entry, so
  // "back" returns to the chat list instead of leaving the Inbox.
  const mobileViewRef = useRef(mobileView)
  useEffect(() => {
    mobileViewRef.current = mobileView
    if (typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches) return
    const pushed = (window.history.state as { zuriInboxChat?: boolean } | null)?.zuriInboxChat
    if (mobileView !== 'list' && !pushed) {
      window.history.pushState({ ...(window.history.state ?? {}), zuriInboxChat: true }, '')
    } else if (mobileView === 'list' && pushed) {
      window.history.back() // in-app back button: drop the entry we pushed
    }
  }, [mobileView])
  useEffect(() => {
    const onPop = () => { if (mobileViewRef.current !== 'list') setMobileView('list') }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => { selectedMsgIdRef.current = selectedMsgId }, [selectedMsgId])

  // ── Actions ───────────────────────────────────────────────────────────────

  const selectConversation = async (convId: string) => {
    if (token && selectedIdRef.current && selectedIdRef.current !== convId) {
      apiClient(`/api/conversations/${selectedIdRef.current}/unlock`, { method: 'POST', token }).catch(() => {})
    }
    selectedIdRef.current = convId
    selectedMsgIdRef.current = null
    setSelectedId(convId); setSelectedMsgId(null); setSuggestions([])
    setThreadSearchOpen(false)
    setThreadSearchQuery('')
    setThreadActiveSearchIndex(0)
    // Reset contact (not just contactDetail) on every switch — the sticky
    // header renders a skeleton while contact is null, so a stale contact
    // lingering from the previous conversation would otherwise flash the
    // wrong name/avatar before the new one loads.
    setContact(null); setContactDetail(null); setMessages([])
    setLoadingMsgs(true); setThreadError(false); setMobileView('thread')
    setDraft(''); setAiTab('overview'); setContextData(null); setPromises([]); setDismissedCardIds([])
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c))
    if (!token) return

    apiClient<{ lockedBy?: string; lockedByName?: string }>(`/api/conversations/${convId}/lock`, { method: 'POST', token })
      .then(d => {
        if (d?.lockedBy) {
          setSelectedConvLock({ lockedBy: d.lockedBy, lockedByName: d.lockedByName })
        } else {
          setSelectedConvLock(null)
        }
      })
      .catch((err: any) => {
        if (err?.status === 409 || err?.data?.lockedBy) {
          setSelectedConvLock({ lockedBy: err.data.lockedBy, lockedByName: err.data.lockedByName })
        }
      })

    try {
      const data = await apiClient<{ messages: Message[]; contact: Contact; hasMore?: boolean }>(
        `/api/conversations/${convId}/messages`, { token }
      )
      if (selectedIdRef.current !== convId) return
      setMessages(data.messages); setContact(data.contact); setHasMoreMsgs(!!data.hasMore); setLoadingMsgs(false)
      if (data.contact?.id) {
        const contactId = data.contact.id
        if (!data.contact.avatarUrl && !data.contact.isGroup) {
          apiClient<{ ok: boolean; avatarUrl?: string | null }>(`/api/contacts/${contactId}/refresh-avatar`, { method: 'POST', token })
            .then(res => {
              if (res?.avatarUrl) {
                setContact(prev => prev ? { ...prev, avatarUrl: res.avatarUrl ?? null } : null)
                setConversations(prev => prev.map(c => c.id === convId ? { ...c, contact: { ...c.contact, avatarUrl: res.avatarUrl ?? null } } : c))
              }
            })
            .catch(() => {})
        }
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

  // Auto-selection of conversation via url params
  useEffect(() => {
    if (conversations.length === 0) return
    if (urlConvId) {
      const found = conversations.find(c => c.id === urlConvId)
      if (found && selectedId !== found.id) {
        selectConversation(found.id)
      }
    } else if (urlContactId) {
      const found = conversations.find(c => c.contact?.id === urlContactId)
      if (found && selectedId !== found.id) {
        selectConversation(found.id)
      }
    }
  }, [conversations, urlConvId, urlContactId, selectedId])

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

  const cancelSync = async () => {
    if (!token) return
    setSyncing(false)
    setSyncDone(false)
    setSyncState(prev => ({ ...prev, active: false, phase: 'cancelled' }))
    await apiClient('/api/inbox/sync-cancel', { method: 'POST', token }).catch(() => {})
  }

  const regenerate = async () => {
    if (!token || !selectedMsgId) return
    setRegenerating(true)
    setSuggestions([])
    setAiNotice(null)

    if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current)

    // Safety 8.5s client-side cap: never leave user on an infinite spinner
    regenerateTimerRef.current = setTimeout(() => {
      setRegenerating(prev => {
        if (prev) {
          setAiNotice({ type: 'warning', text: 'AI draft unavailable — reply manually or retry' })
          setTimeout(() => draftRef.current?.focus(), 50)
        }
        return false
      })
    }, 8500)

    try {
      const res = await apiClient<{ ok?: boolean; error?: string }>(`/api/messages/${selectedMsgId}/regenerate`, { method: 'POST', token })
      if (res && res.error) {
        if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current)
        setRegenerating(false)
        setAiNotice({ type: 'warning', text: res.error })
        setTimeout(() => draftRef.current?.focus(), 50)
      }
    } catch {
      if (regenerateTimerRef.current) clearTimeout(regenerateTimerRef.current)
      setRegenerating(false)
      setAiNotice({ type: 'warning', text: 'AI draft unavailable — reply manually or retry' })
      setTimeout(() => draftRef.current?.focus(), 50)
    }
  }

  const handleReact = async (messageId: string, emoji: string) => {
    if (!selectedId || !token) return
    try {
      const res = await apiClient<{ messageId: string; reactions: Array<{ emoji: string; count: number; userReacted: boolean }> }>(
        `/api/conversations/${selectedId}/messages/${messageId}/react`,
        { method: 'POST', token, body: JSON.stringify({ emoji }) }
      )
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: res.reactions } : m))
    } catch {
      addToast({ variant: 'error', title: 'Reaction failed', description: 'Could not set reaction' })
    }
  }

  const handleForwardMessage = async (targetConversationId: string) => {
    if (!forwardingMessage || !token || !selectedId) return
    try {
      const res = await apiClient<{ message: Message }>(`/api/conversations/${selectedId}/forward`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          messageId: forwardingMessage.id,
          targetConversationId,
        })
      })
      addToast({ variant: 'success', title: 'Message Forwarded', description: 'Message successfully forwarded' })
      setForwardingMessage(null)
      if (selectedId === targetConversationId) {
        setMessages(prev => [...prev, res.message])
      }
    } catch {
      addToast({ variant: 'error', title: 'Forwarding Failed', description: 'Could not forward message' })
    }
  }

  const loadOlderMessages = async () => {
    const convId = selectedId
    const oldest = messages.find(m => !m.id.startsWith('temp-'))?.timestamp
    if (!convId || !token || !oldest || loadingOlder || !hasMoreMsgs) return
    setLoadingOlder(true)
    try {
      const data = await apiClient<{ messages: Message[]; hasMore?: boolean }>(
        `/api/conversations/${convId}/messages?before=${encodeURIComponent(oldest)}`, { token }
      )
      if (selectedIdRef.current !== convId) return
      setMessages(prev => {
        const seen = new Set(prev.map(m => m.id))
        return [...data.messages.filter(m => !seen.has(m.id)), ...prev]
      })
      setHasMoreMsgs(!!data.hasMore)
    } catch {
      addToast({ variant: 'error', title: 'Could not load earlier messages' })
    } finally {
      setLoadingOlder(false)
    }
  }

  const toggleMessageFlag = async (msgId: string, flag: 'star' | 'pin') => {
    if (!token) return
    const key = flag === 'star' ? 'isStarred' : 'isPinned'
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, [key]: !(m as any)[key] } : m))
    try {
      const res = await apiClient<{ isStarred?: boolean; isPinned?: boolean }>(
        `/api/conversations/messages/${msgId}/${flag}`, { method: 'PATCH', token }
      )
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, [key]: Boolean(res[key]) } : m))
    } catch {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, [key]: !(m as any)[key] } : m))
      addToast({ variant: 'error', title: flag === 'star' ? 'Could not star message' : 'Could not pin message' })
    }
  }

  // Photos, videos and PDFs in this chat, in order, for the full-screen viewer.
  const lightboxItems = useMemo<LightboxItem[]>(() => {
    const items: LightboxItem[] = []
    for (const m of [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
      if (!m.mediaUrl || !m.id) continue
      const isPdf = m.messageType === 'document' && (m.mediaMimeType === 'application/pdf' || /\.pdf$/i.test(m.body ?? ''))
      const type = m.messageType === 'image' ? 'image' : m.messageType === 'video' ? 'video' : isPdf ? 'document' : null
      if (!type) continue
      items.push({
        id: m.id,
        type,
        url: mediaHref(m.mediaUrl, token),
        title: type === 'document' ? (m.body ?? 'Document') : (m.senderType === 'user' ? 'You' : (m.senderDisplayName || contact?.name || undefined)),
        mimeType: m.mediaMimeType ?? undefined,
        timestamp: m.timestamp,
      })
    }
    return items
  }, [messages, token, contact?.name])

  const openMediaViewer = (messageId: string) => {
    const i = lightboxItems.findIndex(it => it.id === messageId)
    if (i >= 0) setLightboxIndex(i)
  }

  const handleDeleteMessage = async (msg: any, deleteForEveryone: boolean) => {
    if (!selectedId || !token || !msg?.id) return
    try {
      await apiClient(`/api/conversations/${selectedId}/messages/${msg.id}`, {
        method: 'DELETE',
        token,
        body: JSON.stringify({ deleteForEveryone }),
      })
      addToast({
        variant: 'success',
        title: 'Message Deleted',
        description: deleteForEveryone ? 'Deleted for everyone' : 'Deleted for you',
      })
      setMessages(prev =>
        deleteForEveryone
          ? prev.map(m => m.id === msg.id ? { ...m, body: 'This message was deleted', messageType: 'deleted' } : m)
          : prev.filter(m => m.id !== msg.id)
      )
    } catch {
      addToast({ variant: 'error', title: 'Deletion Failed', description: 'Could not delete message' })
    }
  }

  const handleRefreshAvatar = async () => {
    if (!selectedConv?.contact?.id || !token) return
    try {
      const res = await apiClient<{ avatarUrl: string | null }>(
        `/api/contacts/${selectedConv.contact.id}/refresh-avatar`,
        { method: 'POST', token }
      )
      if (res.avatarUrl) {
        addToast({ variant: 'success', title: 'Avatar Updated', description: 'Contact profile picture refreshed' })
        setConversations(prev =>
          prev.map(c => c.id === selectedId ? { ...c, contact: { ...c.contact, avatarUrl: res.avatarUrl } } : c)
        )
      } else {
        addToast({ variant: 'info', title: 'No Avatar', description: 'Contact has no public profile picture on WhatsApp' })
      }
    } catch {
      addToast({ variant: 'error', title: 'Refresh Failed', description: 'Could not refresh profile picture' })
    }
  }

  const sendDraft = async (textOverride?: string, file?: File | null) => {
    const text = textOverride !== undefined ? textOverride : draft;
    if ((!text.trim() && !file) || !selectedId || !token) return
    
    setDraft('')
    const currentReply = replyingToMessage
    setReplyingToMessage(null)

    const tempId = `temp-${Date.now()}`
    const msgType = file ? (file.type.startsWith('image/') ? 'image' : file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : 'document') : 'text'
    const tempMsg: Message = {
      id: tempId,
      senderType: 'user',
      messageType: msgType,
      // Matches what the server stores: only a real caption is text; documents keep their filename.
      body: text || (msgType === 'document' ? file?.name ?? null : null),
      timestamp: new Date().toISOString(),
      pendingSuggestions: 0,
      deliveryStatus: 'sending',
      quotedMessageId: currentReply?.id || null,
      mediaUrl: file ? URL.createObjectURL(file) : undefined,
      mediaMimeType: file ? file.type : undefined
    } as any;
    setMessages(prev => [...prev, tempMsg])

    try {
      let data;
      if (file) {
        const formData = new FormData()
        formData.append('file', file)
        if (text) {
          formData.append('caption', text)
        }
        if (currentReply?.id) {
          formData.append('quotedMessageId', currentReply.id)
        }
        data = await apiClient<{ message: Message; conversation?: Conversation }>(`/api/conversations/${selectedId}/media`, {
          method: 'POST',
          token,
          body: formData,
        })
      } else {
        data = await apiClient<{ message: Message; conversation?: Conversation }>(`/api/conversations/${selectedId}/messages`, {
          method: 'POST',
          token,
          body: JSON.stringify({
            text,
            quotedMessageId: currentReply?.id || undefined,
          }),
        })
      }
      setMessages(prev => prev.map(m => m.id === tempId ? data.message : m))
      if (tempMsg.mediaUrl?.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(tempMsg.mediaUrl!), 30_000)
      if (data.conversation) setConversations(prev => upsertConversation(prev, data.conversation!))
    } catch (err) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, deliveryStatus: 'failed' } as Message : m))
      addToast({
        variant: 'error',
        title: 'Message not sent',
        description: (err as { data?: { error?: string } })?.data?.error || 'Check your connection and try again.',
      })
      if (text && !file) setDraft(prev => prev || text)
    }
  }

  const selectSuggestionAsDraft = async (s: Suggestion) => {
    setDraft(s.text)
    if (!token) return
    try {
      await apiClient(`/api/suggestions/${s.id}/dismiss`, { method: 'POST', token })
    } catch {}
    setSuggestions(prev => prev.filter(item => item.id !== s.id))
  }

  const sendDirect = async (text: string) => {
    if (!text.trim() || !selectedId || !token) throw new Error('Cannot send')
    const tempId = `temp-${Date.now()}`
    const tempMsg: Message = { id: tempId, senderType: 'user', messageType: 'text', body: text.trim(), timestamp: new Date().toISOString(), pendingSuggestions: 0, isAiGenerated: true }
    setMessages(prev => [...prev, tempMsg])
    const data = await apiClient<{ message: Message; conversation?: Conversation }>(`/api/conversations/${selectedId}/messages`, { method: 'POST', token, body: JSON.stringify({ text: text.trim(), isAiGenerated: true }) })
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

  const openEditContactModal = () => {
    if (!contact) return
    setEditName(contact.name || '')
    setEditPhone(contact.phone || '')
    setShowEditContact(true)
  }

  const saveContact = async () => {
    if (!contact || !token) return
    setEditLoading(true)
    try {
      await apiClient(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name: editName,
          phoneNumber: editPhone,
        }),
      })
      addToast({ variant: 'success', title: 'Contact updated successfully' })
      setContact(prev => prev ? { ...prev, name: editName, phone: editPhone } : null)
      setContactDetail(prev => prev ? { ...prev, name: editName } : null)
      setConversations(prev => prev.map(c => {
        if (c.contact.id === contact.id) {
          return {
            ...c,
            contact: { ...c.contact, name: editName, phone: editPhone }
          }
        }
        return c
      }))
      setShowEditContact(false)
      loadConversations()
    } catch (err: any) {
      addToast({ variant: 'error', title: err?.message || 'Failed to update contact' })
    } finally {
      setEditLoading(false)
    }
  }

  // presence helper
  const contactJid = contact?.phone ? `${contact.phone.replace(/[^0-9]/g, '')}@c.us` : null
  const contactPresence = contactJid ? presenceMap[contactJid] : null

  const getPresenceText = () => {
    if (contact?.isGroup) return 'Group chat'
    if (!contactPresence) {
      if (contactDetail?.relationship?.lastInteractionAt) {
        const date = new Date(contactDetail.relationship.lastInteractionAt)
        return `Last seen ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      }
      return 'Offline'
    }
    if (contactPresence.status === 'composing') {
      return 'typing...'
    }
    if (contactPresence.status === 'recording') {
      return 'recording audio...'
    }
    if (contactPresence.status === 'available') {
      return 'online'
    }
    if (contactPresence.lastSeenAt) {
      const date = new Date(contactPresence.lastSeenAt)
      return `Last seen ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    }
    return 'Offline'
  }

  // thread search helper
  const threadSearchMatches = useMemo(() => {
    if (!threadSearchQuery.trim()) return []
    const q = threadSearchQuery.toLowerCase()
    return messages
      .filter(m => m.body && m.body.toLowerCase().includes(q))
      .map(m => m.id)
  }, [messages, threadSearchQuery])

  const handleThreadSearchPrev = () => {
    if (threadSearchMatches.length === 0) return
    setThreadActiveSearchIndex(prev => (prev - 1 + threadSearchMatches.length) % threadSearchMatches.length)
  }

  const handleThreadSearchNext = () => {
    if (threadSearchMatches.length === 0) return
    setThreadActiveSearchIndex(prev => (prev + 1) % threadSearchMatches.length)
  }


  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = conversations.filter(c => {
    const q = search.toLowerCase()
    const matchSearch = !search || c.contact.name.toLowerCase().includes(q) || (c.contact.phone ?? '').includes(q.replace(/\D/g, '') || '\u0000') || (c.lastMessagePreview ?? '').toLowerCase().includes(q)
    if (filter === 'assigned_to_me') {
      const currentUserId = session.data?.user?.id
      const currentUserEmail = session.data?.user?.email
      return Boolean(
        (currentUserId && c.assignedTo === currentUserId) ||
        (currentUserEmail && c.assignedToEmail === currentUserEmail)
      )
    }
    if (filter === 'unread')      return c.unreadCount > 0
    if (filter === 'needs_reply') return c.unreadCount > 0 || c.aiPriority === 'waiting'
    if (filter === 'hot_leads')   return c.aiPriority === 'hot_lead' || c.aiPriority === 'ready_to_buy'
    if (filter === 'vip')         return (c.leadScore ?? 0) > 80
    if (filter === 'waiting')     return c.aiPriority === 'waiting'
    if (filter === 'at_risk')     return c.sentiment === 'frustrated' || c.sentiment === 'angry' || c.aiPriority === 'dissatisfied'
    return true
  })

  const selectedConv = conversations.find(c => c.id === selectedId) ?? null
  const currentPriority = selectedConv?.aiPriority ? AI_PRIORITY[selectedConv.aiPriority] : null
  const CurrentPIcon = currentPriority?.icon ?? null

  const timelineInsights = useMemo(() => {
    const cards: AIInsight[] = []
    const insights = contactDetail?.insights || []

    const OBSERVATION_KEYS = ['location', 'life', 'job', 'work', 'career', 'city', 'moved', 'relocat', 'home', 'family', 'live', 'living', 'address', 'kitwe', 'lusaka', 'ndola', 'town', 'country']
    const OPPORTUNITY_KEYS = ['price', 'product', 'wholesale', 'quote', 'catalogue', 'catalog', 'buy', 'order', 'cost', 'discount', 'bulk', 'pricing', 'inventory', 'stock', 'rate']
    const ALERT_KEYS = ['sentiment', 'frustration', 'dissatisfied', 'angry', 'complaint', 'upset', 'friction', 'issue', 'delay', 'risk', 'churn', 'late', 'bad']

    // 1. Observation cards (location/life/job keys)
    const obsInsights = insights.filter(i =>
      OBSERVATION_KEYS.some(k => i.key.toLowerCase().includes(k) || i.value.toLowerCase().includes(k))
    )
    obsInsights.forEach((ins, idx) => {
      const cardId = `obs-${ins.key}-${idx}`
      if (dismissedCardIds.includes(cardId)) return

      const text = ins.value.toLowerCase().includes('mov') || ins.key.toLowerCase().includes('location')
        ? `Customer mentioned moving to ${ins.value}. Save to contact?`
        : `Customer mentioned ${ins.value}. Save to contact?`

      cards.push({
        id: cardId,
        type: 'observation',
        title: 'Observation',
        text,
        confidence: ins.confidence || 0.85,
        supportingText: ins.supportingText,
        actionLabel: 'Save to Contact',
        actionType: 'save_contact',
      })
    })

    // 2. Opportunity cards (price/product/wholesale keys)
    const oppInsights = insights.filter(i =>
      OPPORTUNITY_KEYS.some(k => i.key.toLowerCase().includes(k) || i.value.toLowerCase().includes(k))
    )
    oppInsights.forEach((ins, idx) => {
      const cardId = `opp-${ins.key}-${idx}`
      if (dismissedCardIds.includes(cardId)) return

      const isWholesale = ins.key.toLowerCase().includes('wholesale') || ins.value.toLowerCase().includes('wholesale') || ins.value.toLowerCase().includes('pric')
      const text = isWholesale
        ? `Asked about wholesale pricing. You've never sent your catalogue.`
        : ins.value

      cards.push({
        id: cardId,
        type: 'opportunity',
        title: 'Opportunity Detected',
        text,
        confidence: ins.confidence || 0.88,
        supportingText: ins.supportingText,
        actionLabel: 'Send Catalogue',
        actionType: 'send_catalogue',
        actionDraftText: `Hi ${contactDetail?.name?.split(' ')[0] || 'there'}! Here is our product catalogue and wholesale pricing details: https://catalogue.zuri.app/wholesale. Let me know if you have any questions!`,
      })
    })

    // Fallback Opportunity from contextData buyingSignals if no insight matched
    if (oppInsights.length === 0 && contextData?.buyingSignals?.length) {
      const cardId = `opp-buying-signal`
      if (!dismissedCardIds.includes(cardId)) {
        cards.push({
          id: cardId,
          type: 'opportunity',
          title: 'Opportunity Detected',
          text: contextData.buyingSignals[0],
          confidence: 0.85,
          actionLabel: 'Send Catalogue',
          actionType: 'send_catalogue',
          actionDraftText: `Hi! Thank you for asking about our products and pricing. Here is our full catalogue: https://catalogue.zuri.app/latest`,
        })
      }
    }

    // 3. Alert cards (confidence > 0.8, sentiment keys)
    const alertInsights = insights.filter(i =>
      (i.confidence > 0.8 || i.confidence === undefined) &&
      ALERT_KEYS.some(k => i.key.toLowerCase().includes(k) || i.value.toLowerCase().includes(k))
    )
    alertInsights.forEach((ins, idx) => {
      const cardId = `alert-${ins.key}-${idx}`
      if (dismissedCardIds.includes(cardId)) return

      const reasons = ins.supportingText
        ? ins.supportingText.split(/[\n;.]+/).map(r => r.trim()).filter(Boolean)
        : ['Customer tone indicates frustration or dissatisfaction', 'Sentiment confidence > 80%']

      cards.push({
        id: cardId,
        type: 'alert',
        title: 'Frustration Alert',
        text: ins.value.length > 5 ? ins.value : `Customer frustration detected in recent messages (${Math.round((ins.confidence || 0.85) * 100)}% confidence).`,
        confidence: ins.confidence || 0.85,
        reasons,
        actionLabel: 'Draft Apology',
        actionType: 'draft_apology',
        actionDraftText: `I completely understand your frustration and apologize for the inconvenience. Let me review your request immediately and resolve this for you.`,
      })
    })

    // Fallback Alert if dominantSentiment is frustrated/angry
    if (alertInsights.length === 0 && (contextData?.dominantSentiment === 'frustrated' || contextData?.dominantSentiment === 'angry')) {
      const cardId = `alert-sentiment-shift`
      if (!dismissedCardIds.includes(cardId)) {
        cards.push({
          id: cardId,
          type: 'alert',
          title: 'Frustration Alert',
          text: 'Customer tone indicates frustration in recent exchange. Immediate empathetic response recommended.',
          confidence: 0.87,
          reasons: [
            `Dominant sentiment classified as ${contextData.dominantSentiment}`,
            'Customer awaiting resolution or update',
          ],
          actionLabel: 'Draft Apology',
          actionType: 'draft_apology',
          actionDraftText: `I sincerely apologize for the friction here. I'm prioritizing your issue right now and will update you in just a moment.`,
        })
      }
    }

    return cards
  }, [contactDetail, contextData, dismissedCardIds])

  const handleCardAction = useCallback((insight: AIInsight) => {
    if (insight.actionType === 'send_catalogue' || insight.actionType === 'draft_apology') {
      const text = insight.actionDraftText || (insight.actionType === 'send_catalogue'
        ? `Hi! Here is our product catalogue and wholesale price list: https://catalogue.zuri.app.`
        : `I apologize for any inconvenience caused. Let me look into this right away for you.`)
      setDraft(text)
      setTimeout(() => draftRef.current?.focus(), 100)
    } else if (insight.actionType === 'save_contact') {
      if (token && contact?.id) {
        apiClient(`/api/contacts/${contact.id}`, {
          token,
          method: 'PATCH',
          body: JSON.stringify({ notes: `${contactDetail?.notes || ''}\n[AI Observation]: ${insight.text}`.trim() })
        }).catch(() => {})
      }
    }
  }, [token, contact?.id, contactDetail?.notes])

  const handleCardDismiss = useCallback((insight: AIInsight) => {
    if (insight.id) {
      setDismissedCardIds(prev => [...prev, insight.id!])
    }
  }, [])

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

  const zuriPanelCommon = {
    conversationId: selectedId ?? '',
    contactId: contact?.id ?? null,
    contactName: contact ? contactLabel(contact.name, contact.phone) : '',
    isGroup: !!contact?.isGroup,
    token: token ?? null,
    refreshKey: messages.length ? messages[messages.length - 1].id : 0,
    legacyProps: { ...intelPanelProps, onClose: () => setShowAIPanel(false) },
    onSendSuggestion: (id: string) => approveSuggestion(id),
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-stone-50">
      {activeCelebration && (
        <>
          <ChampagneConfettiCanvas />
          <CelebrationBanner
            milestone={activeCelebration.milestone}
            customData={activeCelebration.customData}
            onDismiss={clearCelebration}
          />
        </>
      )}

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
        <div data-tour="inbox-header" className="flex-shrink-0 px-3 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg font-bold tracking-tight text-gray-950">Chats</h1>
              {totalUnread > 0 && (
                <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white tabular-nums">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {defaultAgent && (
                <button
                  onClick={() => setShowAgentPanel(v => !v)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-2.5 text-[11px] font-semibold transition-colors ${
                    defaultAgent.isActive && currentAgentMode !== 'off'
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                  title={`${defaultAgent.name} — auto-reply mode`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${defaultAgent.isActive && currentAgentMode !== 'off' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                  {AUTO_REPLY_MODES.find(m => m.key === currentAgentMode)?.label ?? 'Off'}
                  <ChevronDown size={12} className={`transition-transform ${showAgentPanel ? 'rotate-180' : ''}`} />
                </button>
              )}
              <Dropdown
                align="right"
                trigger={
                  <button className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800" title="More">
                    <MoreVertical size={17} />
                  </button>
                }
                items={[
                  { label: 'Reply queue', icon: <Zap size={14} />, href: '/inbox/queue' },
                  ...(conversations.length > 0 ? [{ label: selectMode ? 'Cancel selection' : 'Select chats', icon: <CheckCircle2 size={14} />, onClick: () => (selectMode ? exitSelectMode() : setSelectMode(true)) }] : []),
                  { label: 'Auto-reply settings', icon: <Settings size={14} />, href: '/settings?tab=auto_responses' },
                  { label: 'Take the tour', icon: <HelpCircle size={14} />, onClick: () => startCustomTour(INBOX_TOUR_STEPS), dividerBefore: true },
                ]}
              />
            </div>
          </div>

          {/* Search (always visible, WhatsApp-style) */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={chatSearchRef}
              type="search" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search chats"
              className="w-full rounded-xl border border-transparent bg-gray-100 py-2 pl-8 pr-8 text-sm placeholder:text-gray-400 focus:border-indigo-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {defaultAgent && showAgentPanel && (
          <div className="mx-3 mb-2 flex-shrink-0 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
            <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{defaultAgent.avatarEmoji} {defaultAgent.name}</p>
            {AUTO_REPLY_MODES.map(mode => (
              <button
                key={mode.key}
                onClick={() => { setAgentMode(mode.key); setShowAgentPanel(false) }}
                className={`w-full rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                  currentAgentMode === mode.key ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        {/* AI Processing Delayed Banner */}
        {queueHealth.aiDelayed && (
          <div className="mx-3 mb-2 flex flex-shrink-0 items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200/70">
            <Clock size={13} className="flex-shrink-0 text-amber-500" />
            <span className="min-w-0">Zuri is catching up on <strong className="tabular-nums">{queueHealth.queueDepth}</strong> messages — reply drafts may be slow.</span>
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
          onSkip={cancelSync}
        />

        {/* Filter chips */}
        <div className="flex items-center gap-1.5 px-3 pb-2 border-b border-gray-100 overflow-x-auto flex-shrink-0 no-scrollbar">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
                filter === f.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Bulk action bar */}
        {selectMode && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-indigo-100 bg-indigo-50/70 flex-shrink-0">
            <button
              onClick={() => {
                const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id))
                setSelectedIds(allSelected ? new Set() : new Set(filtered.map(c => c.id)))
              }}
              className="min-h-9 rounded-xl px-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              {filtered.length > 0 && filtered.every(c => selectedIds.has(c.id)) ? 'Clear all' : `Select all (${filtered.length})`}
            </button>
            <span className="text-xs text-gray-500 tabular-nums">{selectedIds.size} selected</span>
            <button onClick={exitSelectMode} className="min-h-9 rounded-xl px-2.5 text-xs font-semibold text-gray-600 hover:bg-white">Cancel</button>
            <button
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmBulkDelete(true)}
              className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white shadow-sm shadow-rose-200 hover:bg-rose-500 disabled:opacity-40 disabled:shadow-none"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}

        {/* Daily briefing */}
        {!briefingDismissed && mode !== 'personal' && (
          <DailyBriefing name={userName} insights={briefingInsights} items={briefingItems} loading={briefingLoading} onDismiss={dismissBriefingForToday} onOpenConversation={selectConversation} />
        )}

        {/* WhatsApp Status Stories Bar */}
        <StatusStoriesBar
          groups={statusGroups}
          onSelectGroup={(g) => setSelectedStatusGroup(g)}
        />

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
                    onClick={() => (selectMode ? toggleSelected(conv.id) : selectConversation(conv.id))}
                    selectable={selectMode}
                    selected={selectedIds.has(conv.id)}
                    onAvatarClick={() => setEnlargedAvatar({ id: conv.contact.id, name: conv.contact.name, avatarUrl: conv.contact.avatarUrl, phone: conv.contact.phone, isGroup: conv.contact.isGroup })}
                    mode={mode}
                    syncing={rowActive && syncState.phase === 'importing'}
                    analysing={rowActive && syncState.phase === 'analysing'}
                  />
                )
              })}
              {hasMoreConvs && !search && (
                <div className="p-3">
                  <button
                    onClick={loadMoreConversations}
                    disabled={loadingMoreConvs}
                    className="w-full min-h-11 rounded-2xl bg-white text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {loadingMoreConvs ? 'Loading…' : 'Load more conversations'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmBulkDelete}
        onClose={() => !bulkDeleting && setConfirmBulkDelete(false)}
        onConfirm={bulkDeleteConversations}
        title={`Delete ${selectedIds.size} chat${selectedIds.size === 1 ? '' : 's'}?`}
        description="This removes the chats and their messages from Zuri. Nothing is deleted on WhatsApp, and the contacts stay in your contact list."
        confirmLabel="Delete"
        destructive
        loading={bulkDeleting}
      />

      {/* ── Center: Chat ─────────────────────────────────────────────────── */}
      <div className={`${mobileView === 'list' ? 'hidden md:flex' : mobileView === 'intel' ? 'hidden md:flex' : 'flex'} flex-1 flex-col min-w-0 relative`}>
        {selectedId ? (
          <>
            {/* Sticky header — contact is null for a beat after selecting a
                conversation (and stays null on a load failure), so it
                renders a skeleton instead of the header simply vanishing. */}
            {/* Chat header */}
            <div data-tour="inbox-locking-status" className="sticky top-0 z-30 flex h-16 flex-shrink-0 items-center justify-between gap-2 border-b border-gray-200/80 bg-white/90 px-2 backdrop-blur-xl sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  onClick={() => setMobileView('list')}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 md:hidden"
                  aria-label="Back to chats"
                >
                  <ChevronLeft size={22} />
                </button>
                {contact ? (
                  <>
                    <button
                      className="relative flex-shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      onClick={() => setEnlargedAvatar({ id: contact.id, name: contact.name, avatarUrl: contact.avatarUrl, phone: contact.phone, isGroup: contact.isGroup })}
                      title="View profile picture"
                    >
                      <Avatar name={contact.name} src={contact.avatarUrl ?? undefined} size="sm" className="rounded-full" />
                      {!contact.isGroup && (contactPresence?.status === 'available' || contactPresence?.status === 'composing' || contactPresence?.status === 'recording') && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                      )}
                    </button>
                    <button
                      onClick={() => { if (window.matchMedia('(min-width: 768px)').matches) setShowAIPanel(true); else setMobileView('intel') }}
                      className="min-w-0 flex-1 rounded-xl px-1.5 py-1 text-left hover:bg-gray-50"
                      title="Contact info"
                    >
                      <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold leading-tight text-gray-950">
                        {contact.isGroup && <Users size={13} className="flex-shrink-0 text-gray-400" />}
                        <span className="truncate">{contactLabel(contact.name, contact.phone)}</span>
                      </p>
                      <p className={`truncate text-xs leading-tight ${
                        contactPresence?.status === 'composing' || contactPresence?.status === 'recording'
                          ? 'font-medium text-emerald-600'
                          : 'text-gray-500'
                      }`}>
                        {getPresenceText()}
                        {!contact.isGroup && contact.phone && !isPhoneLikeName(contact.name) && contactPresence?.status !== 'composing' && contactPresence?.status !== 'recording' && (
                          <span className="hidden sm:inline tabular-nums text-gray-400"> · {formatPhone(contact.phone)}</span>
                        )}
                      </p>
                    </button>
                    {selectedConvLock?.lockedBy && selectedConvLock.lockedBy !== session.data?.user?.id && (
                      <span className="hidden flex-shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 sm:inline-flex" title={`${selectedConvLock.lockedByName || 'A team member'} is viewing this chat`}>
                        🔒 {selectedConvLock.lockedByName || 'Teammate'}
                      </span>
                    )}
                  </>
                ) : (
                  <div className="flex flex-1 items-center gap-3">
                    <div className="h-9 w-9 flex-shrink-0 animate-pulse rounded-full bg-gray-100" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3 w-32 animate-pulse rounded-full bg-gray-100" />
                      <div className="h-2.5 w-20 animate-pulse rounded-full bg-gray-100" />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-0.5">
                <button
                  onClick={() => setThreadSearchOpen(v => !v)}
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${threadSearchOpen ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                  title="Search in this chat (Cmd+F)"
                >
                  <Search size={18} />
                </button>
                <button
                  onClick={() => {
                    setShowAIPanel(v => !v)
                    setMobileView(v => v === 'intel' ? 'thread' : 'intel')
                  }}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 transition-colors ${
                    showAIPanel || mobileView === 'intel'
                      ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  title="Zuri insights for this chat"
                >
                  <span className={`flex h-6 w-6 items-center justify-center rounded-lg ${showAIPanel || mobileView === 'intel' ? 'bg-white' : ''}`}>
                    <ZuriMark size={18} />
                  </span>
                  <span className="hidden text-xs font-semibold sm:inline">Zuri</span>
                </button>
                {contact && (
                  <Dropdown
                    align="right"
                    trigger={
                      <button data-tour="inbox-quick-actions" className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900" title="More">
                        <MoreVertical size={18} />
                      </button>
                    }
                    items={[
                      { label: 'Edit contact', icon: <Pencil size={14} />, onClick: openEditContactModal },
                      { label: 'Quick quote / invoice', icon: <Zap size={14} />, onClick: () => setShowQuickDocModal(true) },
                      { label: 'Team note', icon: <StickyNote size={14} />, onClick: () => setShowInternalNoteModal(true) },
                      ...(mode !== 'personal' && teamMembers.length > 0 && selectedId
                        ? [
                            { label: selectedConv?.assignedTo ? 'Unassign' : 'Assign to me', icon: <Users size={14} />, dividerBefore: true,
                              onClick: () => assignConversation(selectedId, selectedConv?.assignedTo ? null : (session.data?.user?.id ?? null)) },
                            ...teamMembers.filter(m => m.userId !== session.data?.user?.id).map(m => ({
                              label: `Assign to ${m.fullName || m.email.split('@')[0]}`, icon: <Users size={14} />,
                              onClick: () => assignConversation(selectedId, m.userId),
                            })),
                          ]
                        : []),
                    ]}
                  />
                )}
              </div>
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
                    messages={messages as any}
                    loading={loadingMsgs}
                    token={token}
                    selectedMsgId={selectedMsgId}
                    searchOpen={threadSearchOpen}
                    searchQuery={threadSearchQuery}
                    searchMatches={threadSearchMatches}
                    activeSearchIndex={threadActiveSearchIndex}
                    messagesEndRef={messagesEndRef}
                    timelineInsights={timelineInsights}
                    onCardAction={handleCardAction}
                    onCardDismiss={handleCardDismiss}
                    onSearchChange={(val) => {
                      setThreadSearchQuery(val)
                      setThreadActiveSearchIndex(0)
                    }}
                    onCloseSearch={() => {
                      setThreadSearchOpen(false)
                      setThreadSearchQuery('')
                      setThreadActiveSearchIndex(0)
                    }}
                    onPrevSearch={handleThreadSearchPrev}
                    onNextSearch={handleThreadSearchNext}
                    onSelectMessage={selectMessage}
                    lockInfo={selectedConvLock}
                    onReply={(msg) => {
                      setReplyingToMessage(msg)
                      setTimeout(() => draftRef.current?.focus(), 50)
                    }}
                    onForward={(msg) => setForwardingMessage(msg)}
                    onReact={handleReact}
                    onStar={(id) => toggleMessageFlag(id, 'star')}
                    onPin={(id) => toggleMessageFlag(id, 'pin')}
                    onDelete={handleDeleteMessage}
                    conversationId={selectedId}
                    hasMore={hasMoreMsgs}
                    loadingOlder={loadingOlder}
                    onLoadOlder={loadOlderMessages}
                    onOpenMedia={openMediaViewer}
                  />
                )}
                {selectedConvLock && selectedConvLock.lockedBy && selectedConvLock.lockedBy !== session.data?.user?.id && (
                  <div className="relative z-20 px-4 py-2 bg-amber-500 text-white text-xs font-semibold flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                      <span>🔒 {selectedConvLock.lockedByName || 'Another team member'} is currently viewing/replying to this conversation.</span>
                    </div>
                    <span className="text-[10px] opacity-90 uppercase tracking-wider font-bold bg-amber-600 px-2 py-0.5 rounded">Collision Warning</span>
                  </div>
                )}

                <div data-tour="inbox-ai-suggestions">
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
                    onSelectSuggestion={selectSuggestionAsDraft}
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
                    isGroup={contact?.isGroup ?? false}
                    aiNotice={aiNotice}
                    activeLock={selectedConvLock?.lockedBy && selectedConvLock.lockedBy !== session.data?.user?.id ? selectedConvLock : null}
                    replyingToMessage={replyingToMessage}
                    onCancelReply={() => setReplyingToMessage(null)}
                  />
                </div>
              </div>

              {/* Right: Intelligence panel (desktop) */}
              {showAIPanel && contact && (
                <div data-tour="inbox-lead-context" className="hidden md:flex w-[340px] xl:w-[360px] border-l border-gray-200 flex-col flex-shrink-0 overflow-hidden">
                  <ZuriPanel
                    {...zuriPanelCommon}
                    onClose={() => setShowAIPanel(false)}
                    onUseDraft={text => { setDraft(text); setTimeout(() => draftRef.current?.focus(), 50) }}
                    onFocusComposer={() => draftRef.current?.focus()}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-stone-50 p-6 text-center">
            <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-purple-600 text-white rounded-2xl shadow-xl flex items-center justify-center mb-4">
              <MessageSquare size={28} />
            </div>
            <p className="text-base font-bold text-gray-900 mb-1">Select a conversation or Explore Standalone Tools</p>
            <p className="text-xs text-gray-500 mb-6 max-w-sm leading-relaxed">
              Zuri works standalone for your business and career even if WhatsApp is not connected yet!
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
              <a href="/business" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all">
                Business ERP &amp; Quotes →
              </a>
              <a href="/contacts" className="px-4 py-2 bg-white border border-gray-200 text-gray-800 hover:bg-gray-50 text-xs font-bold rounded-xl shadow-sm transition-all">
                Contacts CRM →
              </a>
              <a href="/career" className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl shadow-md transition-all">
                Career OS &amp; CV Studio →
              </a>
            </div>
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
          <ZuriPanel
            {...zuriPanelCommon}
            legacyProps={{
              ...zuriPanelCommon.legacyProps,
              onSetDraft: text => { setDraft(text); setMobileView('thread') },
              draftFocus: () => { setMobileView('thread'); setTimeout(() => draftRef.current?.focus(), 100) },
            }}
            onClose={() => setMobileView('thread')}
            onUseDraft={text => { setDraft(text); setMobileView('thread'); setTimeout(() => draftRef.current?.focus(), 100) }}
            onFocusComposer={() => { setMobileView('thread'); setTimeout(() => draftRef.current?.focus(), 100) }}
          />
        </div>
      )}

      {/* Edit Contact Modal */}
      <Modal
        open={showEditContact}
        onClose={() => setShowEditContact(false)}
        title="Edit Contact"
        description="Update the contact's name and phone number. This changes how they appear across the platform."
        size="md"
        footer={
          <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
            <Button variant="secondary" onClick={() => setShowEditContact(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={editLoading} onClick={saveContact}>
              Save Changes
            </Button>
          </div>
        }
      >
        <div className="px-6 py-4 space-y-4">
          <Input
            label="Name"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            placeholder="Contact Name"
          />
          <Input
            label="Phone Number"
            value={editPhone}
            onChange={e => setEditPhone(e.target.value)}
            placeholder="Phone Number (e.g. 27712345678)"
            helper="Use digits only. Updating this will automatically regenerate their JID."
          />
        </div>
      </Modal>

      {/* Team Member Shared Inbox Tutorial & Privacy Guide Modal */}
      <Modal
        open={showTutorialModal}
        onClose={closeTutorialModal}
        title="Welcome to the Shared Team Inbox 👋"
        description="A 60-second guide on how your company's shared WhatsApp workspace works and keeps personal chats private."
        size="lg"
        footer={
          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl">
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Personal messages are strictly filtered out</span>
            </div>
            <Button variant="primary" onClick={closeTutorialModal}>
              Got It, Let's Go! 🚀
            </Button>
          </div>
        }
      >
        <div className="px-6 py-4 space-y-5">
          {/* Card 1: Shared Inbox Purpose */}
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              💬
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">What is this Shared Inbox?</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                You are accessing your company's official business WhatsApp workspace. All customer inquiries, leads, and sales orders land here so team members can respond seamlessly together.
              </p>
            </div>
          </div>

          {/* Card 2: Privacy Guarantee & Personal Messages */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              🔒
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">Personal & Private Messages Are Filtered Out</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Your company's owner/admin configures strict privacy rules. <strong>Personal WhatsApp chats, non-business messages, and private contacts are automatically filtered out and hidden from team members.</strong> You will only see business conversations.
              </p>
            </div>
          </div>

          {/* Card 3: Color-Coding Assignment Guide */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Conversation Status & Color Guide</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                  Green = Unassigned
                </div>
                <p className="text-[11px] text-emerald-900/80 leading-snug">
                  Unclaimed lead/question. Click <strong>"Assign to Me"</strong> to take ownership.
                </p>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block"></span>
                  Blue = Assigned to You
                </div>
                <p className="text-[11px] text-indigo-900/80 leading-snug">
                  Active thread owned by you. AI reply drafts are tailored for your responses.
                </p>
              </div>

              <div className="p-3 bg-gray-100 border border-gray-200 rounded-xl space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block"></span>
                  Gray = Teammate
                </div>
                <p className="text-[11px] text-gray-600 leading-snug">
                  Managed by a colleague. Collision warning prevents double-replying.
                </p>
              </div>
            </div>
          </div>

          {/* Card 4: AI Reply Suggestions */}
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              ⚡
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-gray-900">AI Reply Drafts & Human Approvals</h4>
              <p className="text-xs text-gray-600 leading-relaxed">
                Zuri automatically analyzes customer questions and drafts suggested replies or quotes in the dock. <strong>Zero messages leave without your review and approval.</strong>
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <Modal
          open={!!forwardingMessage}
          onClose={() => setForwardingMessage(null)}
          title="Forward Message"
          description="Select a conversation to forward this message to."
          size="md"
        >
          <div className="p-5 space-y-4">
            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-extrabold uppercase text-slate-500 mb-1">Message Preview</p>
              <p className="text-xs text-slate-800 dark:text-slate-200 font-medium line-clamp-3">
                {forwardingMessage.body || 'Attachment'}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 block">
                Select Recipient Conversation:
              </label>
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {conversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => handleForwardMessage(conv.id)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/50 border border-slate-200 dark:border-slate-700 transition-colors text-left group"
                  >
                    <Avatar
                      src={conv.contact.avatarUrl || undefined}
                      name={conv.contact.name || conv.contact.phone}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600">
                        {conv.contact.name || conv.contact.phone}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {conv.contact.phone}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
                      Send →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Group Participants Drawer */}
      {selectedConv?.contact?.isGroup && (
        <GroupParticipantsDrawer
          open={groupDrawerOpen}
          onClose={() => setGroupDrawerOpen(false)}
          conversationId={selectedId || ''}
          groupName={selectedConv.contact.name || selectedConv.contact.phone || 'WhatsApp Group'}
          groupAvatar={selectedConv.contact.avatarUrl ?? null}
          token={token}
        />
      )}

      {/* WhatsApp Status Viewer Modal */}
      {selectedStatusGroup && (
        <StatusViewerModal
          group={selectedStatusGroup}
          token={token}
          onClose={() => setSelectedStatusGroup(null)}
        />
      )}

      {/* WhatsApp Profile Picture Lightbox Modal */}
      {enlargedAvatar && (
        <ProfilePictureModal
          contact={enlargedAvatar}
          token={token}
          onClose={() => setEnlargedAvatar(null)}
          onAvatarUpdated={(newUrl) => {
            if (contact && contact.id === enlargedAvatar.id) {
              setContact(prev => prev ? { ...prev, avatarUrl: newUrl } : null)
            }
            setConversations(prev => prev.map(c => c.contact.id === enlargedAvatar.id ? { ...c, contact: { ...c.contact, avatarUrl: newUrl } } : c))
          }}
        />
      )}
      {/* ⚡ Quick Document Modal */}
      {contact && (
        <QuickDocModal
          open={showQuickDocModal}
          onClose={() => setShowQuickDocModal(false)}
          contact={contact}
          token={token ?? null}
          onDocumentCreatedAndSent={(docNum, shareUrl) => {
            setDraft(`Hi ${contact.name}, here is your ${docNum}: ${shareUrl}`)
          }}
        />
      )}

      <MediaLightbox
        items={lightboxItems}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    </div>
  )
}
