'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useZuriSession } from '@/hooks/use-zuri-session'
import { apiClient } from '@/lib/api'
import {
  FileText, Globe, FileEdit, BookOpen, Table, Upload, Link2,
  Sparkles, Search, RefreshCw, Trash2, Eye, RotateCcw,
  AlertTriangle, X, ChevronRight, File as FileIcon, Send, Database,
  Layers, Clock, Tag, CheckCircle, AlertCircle, Loader2, Image as ImageIcon,
  Check, ShieldAlert, Cpu, GitBranch, Share2, HelpCircle, Plus,
  BarChart3, ArrowRight, ThumbsUp, ThumbsDown, Edit3, Merge, Filter,
  Building2, DollarSign, Package, UserCheck, ShieldCheck, Zap
} from 'lucide-react'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface KbDocument {
  id: string
  title: string
  sourceType: 'pdf' | 'url' | 'text' | 'excel' | 'csv' | 'docx' | 'pptx' | string
  sourceUrl: string | null
  category: string | null
  tags: string[]
  status: 'ready' | 'processing' | 'error' | string
  chunkCount: number
  wordCount: number | null
  fileSizeBytes: number | null
  usedCount: number | null
  lastUsedAt: string | null
  summary: string | null
  errorMessage: string | null
  contentPreview: string | null
  createdAt: string
}

interface BusinessFact {
  id: string
  category: string
  factKey: string
  factValue: string
  confidence: number
  source: string
  isApproved: boolean
  createdAt: string
}

interface KnowledgeSuggestion {
  id: string
  suggestionType: string
  category: string
  title: string
  proposedKey: string | null
  proposedValue: string
  existingValue: string | null
  confidence: number
  sourceType: string
  sourceId: string | null
  sourceSnippet: string | null
  detectedEntities: string[]
  status: string
  createdAt: string
}

interface GraphNode {
  id: string
  label: string
  type: string
}

interface GraphEdge {
  id: string
  fromType: string
  fromId: string
  toType: string
  toId: string
  relation: string
  confidence: number
}

interface DuplicateCandidate {
  id: string
  entityType: string
  primaryId: string
  duplicateId: string
  similarityScore: number
  reason: string
  status: string
  createdAt: string
}

interface KnowledgeAnalytics {
  completenessScore: number
  qualityScore: number
  totalFacts: number
  totalDocuments: number
  pendingSuggestions: number
  flaggedDuplicates: number
  categoryBreakdown: Record<string, number>
}

interface ChatMessage {
  id: string
  question: string
  answer: string
  sources: { content: string; score: number }[]
}

interface SearchResult {
  chunk_id?: string
  chunk_index?: number
  token_count?: number
  document_id: string
  document_title: string
  content: string
  score: number
  source_type: string
  category: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatWords(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'Never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function TypeIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  const t = type.toLowerCase()
  if (t === 'pdf') return <FileText className={`${className} text-red-500`} />
  if (t === 'url') return <Globe className={`${className} text-blue-500`} />
  if (t === 'text') return <FileEdit className={`${className} text-green-500`} />
  if (['excel', 'xlsx', 'xls', 'csv'].includes(t)) return <Table className={`${className} text-emerald-600`} />
  if (['word', 'docx', 'doc'].includes(t)) return <BookOpen className={`${className} text-indigo-500`} />
  if (['pptx', 'ppt', 'presentation'].includes(t)) return <Layers className={`${className} text-purple-500`} />
  if (t === 'image') return <ImageIcon className={`${className} text-pink-500`} />
  return <FileIcon className={`${className} text-gray-400`} />
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'ready' || status === 'approved') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
      <CheckCircle className="w-3 h-3" /> Ready
    </span>
  )
  if (status === 'processing' || status === 'pending') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
      <Loader2 className="w-3 h-3 animate-spin" /> Pending Review
    </span>
  )
  if (status === 'error' || status === 'rejected') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
      <AlertCircle className="w-3 h-3" /> Failed
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
      {status}
    </span>
  )
}

function ModalWrapper({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {children}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const session = useZuriSession()
  const token = session.data?.accessToken

  // Tab State: 'overview' | 'queue' | 'facts' | 'documents' | 'graph' | 'studio'
  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'facts' | 'documents' | 'graph' | 'studio'>('overview')

  // Core Data State
  const [analytics, setAnalytics] = useState<KnowledgeAnalytics | null>(null)
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([])
  const [facts, setFacts] = useState<BusinessFact[]>([])
  const [documents, setDocuments] = useState<KbDocument[]>([])
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([])
  const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([])
  const [loading, setLoading] = useState(true)

  // Modals State
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [showFactModal, setShowNoteModalFact] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState<KbDocument | null>(null)
  const [editingSuggestion, setEditingSuggestion] = useState<KnowledgeSuggestion | null>(null)
  const [editedSuggestionValue, setEditedSuggestionValue] = useState('')

  // Fact Form State
  const [newFactCategory, setNewFactCategory] = useState('pricing')
  const [newFactKey, setNewFactKey] = useState('')
  const [newFactValue, setNewFactValue] = useState('')
  const [savingFact, setSavingFact] = useState(false)

  // Upload & Scrape Form State
  const [uploadFileObj, setUploadFileObj] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState('general')
  const [uploadingFile, setUploadingFile] = useState(false)

  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeCategory, setScrapeCategory] = useState('general')
  const [scrapingUrl, setScrapingUrl] = useState(false)

  // Chunk Editing State
  const [editingChunk, setEditingChunk] = useState<{ id: string; chunkIndex: number; content: string; documentTitle?: string } | null>(null)
  const [editingChunkContent, setEditingChunkContent] = useState('')
  const [savingChunk, setSavingChunk] = useState(false)
  const [docChunks, setDocChunks] = useState<{ id: string; chunkIndex: number; content: string; tokenCount: number; updatedAt: string }[]>([])
  const [loadingDocChunks, setLoadingDocChunks] = useState(false)

  // Search & Q&A Studio State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatLoading, setChatLoading] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null)
  const showToast = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }, [])

  const loadDocChunks = useCallback(async (docId: string) => {
    if (!token) return
    setLoadingDocChunks(true)
    try {
      const data = await apiClient<{ chunks: { id: string; chunkIndex: number; content: string; tokenCount: number; updatedAt: string }[] }>(`/api/knowledge/documents/${docId}/chunks`, { token })
      setDocChunks(data.chunks || [])
    } catch {
      setDocChunks([])
    } finally {
      setLoadingDocChunks(false)
    }
  }, [token])

  const handleSaveChunkEdit = async () => {
    if (!token || !editingChunk || !editingChunkContent.trim()) return
    setSavingChunk(true)
    try {
      await apiClient(`/api/knowledge/chunks/${editingChunk.id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ content: editingChunkContent.trim() }),
      })
      showToast('Chunk updated & vector re-embedded!', 'success')
      setEditingChunk(null)
      if (selectedDoc?.id) {
        loadDocChunks(selectedDoc.id)
      }
      if (searchQuery.trim()) {
        handleKnowledgeSearch()
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update chunk', 'error')
    } finally {
      setSavingChunk(false)
    }
  }

  // ── Load All Memory Engine Data ──────────────────────────────────────────────

  const loadMemoryData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [analyticsRes, suggestionsRes, factsRes, docsRes, graphRes, dupsRes] = await Promise.allSettled([
        apiClient<KnowledgeAnalytics>('/api/knowledge/analytics', { token }),
        apiClient<{ suggestions: KnowledgeSuggestion[] }>('/api/knowledge/suggestions?status=pending', { token }),
        apiClient<{ facts: BusinessFact[] }>('/api/business-facts', { token }),
        apiClient<{ documents: KbDocument[] }>('/api/knowledge/documents', { token }),
        apiClient<{ nodes: GraphNode[]; edges: GraphEdge[] }>('/api/knowledge/graph', { token }),
        apiClient<{ duplicates: DuplicateCandidate[] }>('/api/knowledge/duplicates', { token }),
      ])

      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value)
      if (suggestionsRes.status === 'fulfilled') setSuggestions(suggestionsRes.value.suggestions || [])
      if (factsRes.status === 'fulfilled') setFacts(factsRes.value.facts || [])
      if (docsRes.status === 'fulfilled') setDocuments(docsRes.value.documents || [])
      if (graphRes.status === 'fulfilled') {
        setGraphNodes(graphRes.value.nodes || [])
        setGraphEdges(graphRes.value.edges || [])
      }
      if (dupsRes.status === 'fulfilled') setDuplicates(dupsRes.value.duplicates || [])
    } catch (err) {
      showToast('Failed to load knowledge base data', 'error')
    } finally {
      setLoading(false)
    }
  }, [token, showToast])

  useEffect(() => {
    loadMemoryData()
  }, [loadMemoryData])

  // ── Action Handlers ──────────────────────────────────────────────────────────

  const handleApproveSuggestion = async (id: string, editedVal?: string) => {
    if (!token) return
    try {
      await apiClient(`/api/knowledge/suggestions/${id}/approve`, {
        method: 'POST',
        token,
        body: JSON.stringify({ editedValue: editedVal }),
      })
      showToast('Knowledge suggestion approved & published to business memory', 'success')
      setEditingSuggestion(null)
      loadMemoryData()
    } catch (err) {
      showToast('Failed to approve suggestion', 'error')
    }
  }

  const handleRejectSuggestion = async (id: string) => {
    if (!token) return
    try {
      await apiClient(`/api/knowledge/suggestions/${id}/reject`, {
        method: 'POST',
        token,
      })
      showToast('Suggestion rejected', 'info')
      loadMemoryData()
    } catch (err) {
      showToast('Failed to reject suggestion', 'error')
    }
  }

  const handleBulkSuggestions = async (action: 'approve_all' | 'reject_all') => {
    if (!token) return
    try {
      await apiClient('/api/knowledge/suggestions/bulk', {
        method: 'POST',
        token,
        body: JSON.stringify({ action }),
      })
      showToast(action === 'approve_all' ? 'All suggestions approved' : 'Queue cleared', 'success')
      loadMemoryData()
    } catch (err) {
      showToast('Bulk action failed', 'error')
    }
  }

  const handleCreateFact = async () => {
    if (!token || !newFactKey.trim() || !newFactValue.trim()) return
    setSavingFact(true)
    try {
      await apiClient('/api/business-facts', {
        method: 'POST',
        token,
        body: JSON.stringify({
          category: newFactCategory,
          factKey: newFactKey,
          factValue: newFactValue,
        }),
      })
      showToast('Business fact saved', 'success')
      setNewFactKey('')
      setNewFactValue('')
      setShowNoteModalFact(false)
      loadMemoryData()
    } catch (err) {
      showToast('Failed to save business fact', 'error')
    } finally {
      setSavingFact(false)
    }
  }

  const handleMergeDuplicate = async (id: string) => {
    if (!token) return
    try {
      await apiClient(`/api/knowledge/duplicates/${id}/merge`, { method: 'POST', token })
      showToast('Duplicate record merged successfully', 'success')
      loadMemoryData()
    } catch (err) {
      showToast('Failed to merge duplicate', 'error')
    }
  }

  const handleKnowledgeSearch = async () => {
    if (!token || !searchQuery.trim()) return
    setSearchLoading(true)
    try {
      const res = await apiClient<{ results: SearchResult[] }>(`/api/knowledge/search?q=${encodeURIComponent(searchQuery)}`, { token })
      setSearchResults(res.results || [])
    } catch (err) {
      showToast('Search failed', 'error')
    } finally {
      setSearchLoading(false)
    }
  }

  const handleKnowledgeChat = async () => {
    if (!token || !chatInput.trim() || chatLoading) return
    const q = chatInput.trim()
    setChatInput('')
    setChatLoading(true)
    const tempId = Date.now().toString()
    setChatHistory(prev => [...prev, { id: tempId, question: q, answer: 'Thinking...', sources: [] }])
    try {
      const res = await apiClient<{ answer: string; sources: { content: string; score: number }[] }>('/api/knowledge/chat', {
        method: 'POST',
        token,
        body: JSON.stringify({ question: q }),
      })
      setChatHistory(prev => prev.map(m => m.id === tempId ? { ...m, answer: res.answer, sources: res.sources || [] } : m))
    } catch (err) {
      setChatHistory(prev => prev.map(m => m.id === tempId ? { ...m, answer: 'Sorry, I failed to retrieve context.' } : m))
    } finally {
      setChatLoading(false)
    }
  }

  const handleUploadDocument = async () => {
    if (!token || !uploadFileObj) return
    setUploadingFile(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFileObj)
      formData.append('title', uploadFileObj.name.replace(/\.[^.]+$/, ''))
      formData.append('category', uploadCategory)

      const res = await fetch('/api/proxy/api/knowledge/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Upload failed')
      }

      showToast('Document uploaded successfully & queued for Q&A extraction!', 'success')
      setShowUploadModal(false)
      setUploadFileObj(null)
      loadMemoryData()
    } catch (err: any) {
      showToast(err.message || 'Failed to upload document', 'error')
    } finally {
      setUploadingFile(false)
    }
  }

  const handleScrapeUrl = async () => {
    if (!token || !scrapeUrl.trim()) return
    setScrapingUrl(true)
    try {
      await apiClient('/api/knowledge/add-url', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: scrapeUrl.replace(/^https?:\/\//, '').split('/')[0] || 'Web Page',
          url: scrapeUrl.trim(),
          category: scrapeCategory,
        }),
      })
      showToast('Web URL queued for crawling & knowledge extraction!', 'success')
      setShowUrlModal(false)
      setScrapeUrl('')
      loadMemoryData()
    } catch (err: any) {
      showToast('Failed to crawl web URL', 'error')
    } finally {
      setScrapingUrl(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20 pt-4 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium flex items-center gap-2 transition-all ${
          toast.type === 'success' ? 'bg-green-900 text-white border-green-800' :
          toast.type === 'error' ? 'bg-red-900 text-white border-red-800' :
          'bg-gray-900 text-white border-gray-800'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-4 h-4 text-green-400" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Cpu className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Organizational Knowledge & Memory System</h1>
          </div>
          <p className="text-sm text-gray-500">
            Zuri's continuous long-term memory layer — automatically capturing facts, rules, documents, and relationship graphs across all business channels.
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
          >
            <Upload className="w-4 h-4" /> Upload Document
          </button>
          <button
            onClick={() => setShowUrlModal(true)}
            className="px-3.5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
          >
            <Globe className="w-4 h-4 text-blue-500" /> Scrape Web URL
          </button>
          <button
            onClick={() => setShowNoteModalFact(true)}
            className="px-3.5 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
          >
            <Plus className="w-4 h-4 text-green-500" /> Add Fact / Policy
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-gray-200 pb-2 no-scrollbar">
        {[
          { id: 'overview', label: 'Memory Dashboard', icon: BarChart3 },
          { id: 'queue', label: `Approval Queue (${suggestions.length})`, icon: ShieldAlert, badge: suggestions.length },
          { id: 'facts', label: 'Fact & Policy Roster', icon: Zap },
          { id: 'documents', label: 'Documents Vault', icon: BookOpen },
          { id: 'graph', label: 'Knowledge Graph', icon: GitBranch },
          { id: 'studio', label: 'Search & Q&A Studio', icon: Sparkles },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge && tab.badge > 0 ? (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? 'bg-indigo-800 text-white' : 'bg-amber-100 text-amber-800'
                }`}>
                  {tab.badge}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {/* ── TAB 1: OVERVIEW & HEALTH DASHBOARD ───────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          
          {/* Health & Completeness Score Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Business Memory Completeness */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Memory Completeness</span>
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-gray-900 font-numeric">{analytics?.completenessScore || 0}%</span>
                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Optimal</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${analytics?.completenessScore || 0}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Calculated across policies, pricing, customer facts, products, and indexed documents.
              </p>
            </div>

            {/* Knowledge Quality Score */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Knowledge Quality</span>
                <Zap className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-gray-900 font-numeric">{analytics?.qualityScore || 100}%</span>
                <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">Verified</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-500"
                  style={{ width: `${analytics?.qualityScore || 100}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-500">
                Reflects low redundancy, human review status, and active corroboration.
              </p>
            </div>

            {/* Pending Approvals Alert Card */}
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Pending Review Queue</span>
                <ShieldAlert className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black text-amber-900 font-numeric">{suggestions.length}</span>
                <span className="text-xs font-semibold text-amber-800">Auto-Detected Facts</span>
              </div>
              <button
                onClick={() => setActiveTab('queue')}
                className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5"
              >
                Review Items Now <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Active Business Facts', val: facts.length, icon: Zap, color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Indexed Documents', val: documents.length, icon: BookOpen, color: 'text-blue-600 bg-blue-50' },
              { label: 'Graph Entities', val: graphNodes.length, icon: GitBranch, color: 'text-purple-600 bg-purple-50' },
              { label: 'Flagged Duplicates', val: duplicates.length, icon: Merge, color: 'text-orange-600 bg-orange-50' },
            ].map(m => {
              const Icon = m.icon
              return (
                <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${m.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase">{m.label}</p>
                    <p className="text-xl font-black text-gray-900 font-numeric">{m.val}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Category Breakdown & Duplicates Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Category Coverage Breakdown */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" /> Knowledge Coverage by Category
              </h3>
              <div className="space-y-2.5">
                {['pricing', 'policies', 'products', 'services', 'procedures', 'general'].map(cat => {
                  const count = facts.filter(f => f.category?.toLowerCase() === cat).length
                  const pct = Math.min(100, count * 15)
                  return (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-gray-700 capitalize">
                        <span>{cat}</span>
                        <span>{count} facts</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Duplicates Manager Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Merge className="w-4 h-4 text-orange-600" /> Duplicate Candidates ({duplicates.length})
                </h3>
              </div>
              {duplicates.length === 0 ? (
                <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-xl">
                  <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-gray-700">No duplicate items detected</p>
                  <p className="text-[11px] text-gray-400 mt-1">Zuri continuously monitors memory items for redundancy.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {duplicates.map(dup => (
                    <div key={dup.id} className="p-3 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <p className="font-bold text-gray-900 capitalize">{dup.entityType} Duplicate Candidate</p>
                        <p className="text-gray-500 text-[11px]">{dup.reason}</p>
                      </div>
                      <button
                        onClick={() => handleMergeDuplicate(dup.id)}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-bold transition-all text-[11px]"
                      >
                        1-Click Merge
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ── TAB 2: SMART APPROVAL QUEUE ──────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Auto-Captured Knowledge Queue</h2>
              <p className="text-xs text-gray-500">Zuri observed these facts from messaging, invoices, and notes. Review before publishing to memory.</p>
            </div>
            {suggestions.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkSuggestions('approve_all')}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all"
                >
                  Approve All
                </button>
                <button
                  onClick={() => handleBulkSuggestions('reject_all')}
                  className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition-all"
                >
                  Clear Queue
                </button>
              </div>
            )}
          </div>

          {suggestions.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center space-y-3">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
              <h3 className="text-sm font-bold text-gray-900">Review Queue Empty</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                All auto-detected business facts and contact preferences have been reviewed or auto-approved.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {suggestions.map(sug => (
                <div key={sug.id} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {sug.category}
                        </span>
                        <span className="text-xs font-bold text-gray-900">{sug.title}</span>
                      </div>
                      <p className="text-xs text-gray-500">Key: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800">{sug.proposedKey || 'general_fact'}</code></p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                        {Math.round(sug.confidence * 100)}% Confidence
                      </span>
                    </div>
                  </div>

                  {/* Proposed Value & Diff Display */}
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 space-y-2 text-xs">
                    <p className="font-bold text-gray-700">Proposed Value:</p>
                    <p className="text-gray-900 leading-relaxed font-mono bg-white p-2.5 rounded-lg border border-gray-200">{sug.proposedValue}</p>
                    {sug.existingValue && (
                      <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-red-600">
                        <span className="font-bold">Previous Value:</span> {sug.existingValue}
                      </div>
                    )}
                  </div>

                  {/* Source Snippet */}
                  {sug.sourceSnippet && (
                    <p className="text-[11px] text-gray-500 italic bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/50">
                      Source snippet: &ldquo;{sug.sourceSnippet}&rdquo;
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => {
                        setEditingSuggestion(sug)
                        setEditedSuggestionValue(sug.proposedValue)
                      }}
                      className="px-3 py-2 border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" /> Edit Before Approve
                    </button>
                    <button
                      onClick={() => handleRejectSuggestion(sug.id)}
                      className="px-3.5 py-2 border border-red-200 hover:bg-red-50 text-red-600 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                    >
                      <ThumbsDown className="w-3.5 h-3.5" /> Reject
                    </button>
                    <button
                      onClick={() => handleApproveSuggestion(sug.id)}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <ThumbsUp className="w-3.5 h-3.5" /> Approve & Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: FACT & POLICY ROSTER ──────────────────────────────────────── */}
      {activeTab === 'facts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Active Business Facts & Rules</h2>
              <p className="text-xs text-gray-500">Live single source of truth for pricing, policies, shipping, and FAQs.</p>
            </div>
            <button
              onClick={() => setShowNoteModalFact(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Fact
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {facts.map(fact => (
              <div key={fact.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-2 hover:border-indigo-300 transition-all">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {fact.category}
                  </span>
                  <span className="text-[11px] font-bold text-gray-400 font-mono">{fact.factKey}</span>
                </div>
                <p className="text-xs font-medium text-gray-900 leading-relaxed bg-gray-50 p-3 rounded-xl border border-gray-100">
                  {fact.factValue}
                </p>
                <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1">
                  <span>Source: {fact.source}</span>
                  <span>Added {relativeTime(fact.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 4: DOCUMENTS VAULT ───────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Indexed Knowledge Vault</h2>
              <p className="text-xs text-gray-500">Multi-format file storage parsed and vectorized for instant agent retrieval.</p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" /> Upload File
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.map(doc => (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className="bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-4 shadow-sm cursor-pointer transition-all space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="p-2 bg-gray-50 rounded-xl border border-gray-200 flex-shrink-0">
                      <TypeIcon type={doc.sourceType} className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{doc.title}</p>
                      <p className="text-[11px] text-gray-400 capitalize">{doc.sourceType} • {doc.category || 'General'}</p>
                    </div>
                  </div>
                  <StatusBadge status={doc.status} />
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-gray-50 p-2.5 rounded-xl text-gray-600 font-numeric">
                  <div>Chunks: <span className="font-bold text-gray-900">{doc.chunkCount}</span></div>
                  <div>Words: <span className="font-bold text-gray-900">{doc.wordCount ? formatWords(doc.wordCount) : '—'}</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 5: KNOWLEDGE GRAPH ───────────────────────────────────────────── */}
      {activeTab === 'graph' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-indigo-600" /> Relational Knowledge Graph Explorer
            </h2>
            <p className="text-xs text-gray-500">Visual mapping of entity connections across customers, products, suppliers, and projects.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[300px]">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Entities ({graphNodes.length})</h3>
              <div className="space-y-1.5 max-h-64 overflow-y-auto text-xs">
                {graphNodes.map(node => (
                  <div key={node.id} className="p-2 bg-white rounded-lg border border-gray-200 font-medium text-gray-900 flex justify-between">
                    <span>{node.label}</span>
                    <span className="text-[10px] text-indigo-600 uppercase font-bold">{node.type}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-2 bg-gray-900 text-white rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-3 border border-gray-800">
              <Share2 className="w-10 h-10 text-indigo-400 animate-pulse" />
              <h3 className="text-sm font-bold">GraphRAG Active</h3>
              <p className="text-xs text-gray-400 max-w-md">
                Zuri automatically traverses relationships to deliver deep contextual responses across invoicing, CRM messaging, and advisor tools.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 6: TEST KNOWLEDGE BASE & RAG PLAYGROUND ────────────────────── */}
      {activeTab === 'studio' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Hybrid Semantic Search & Retrieved Vector Inspector */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Search className="w-4 h-4 text-indigo-600" /> Vector RAG Search & Chunk Inspector
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                pgvector 1536-D
              </span>
            </div>

            <p className="text-xs text-gray-500">
              Query vector chunks in real time to verify retrieval match scores. Edit any chunk text to instantly re-embed vectors in PostgreSQL.
            </p>

            <div className="flex gap-2">
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleKnowledgeSearch() }}
                placeholder="Ask e.g. What is our price for Pro Tier?"
                className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleKnowledgeSearch}
                disabled={searchLoading}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {searchLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />} Test Search
              </button>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {searchResults.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-xs text-gray-400">
                  <Database className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  Run a query above to inspect exact retrieved chunks, similarity scores, and metadata.
                </div>
              ) : (
                searchResults.map((res, idx) => {
                  const matchPct = (res.score * 100).toFixed(1)
                  return (
                    <div key={idx} className="p-3.5 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs hover:border-indigo-300 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-bold text-gray-900">{res.document_title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-400 capitalize">{res.source_type} • {res.category || 'general'}</span>
                            {res.chunk_index !== undefined && (
                              <span className="text-[10px] font-mono text-gray-500 bg-gray-200/60 px-1.5 py-0.2 rounded">
                                Chunk #{res.chunk_index + 1}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-numeric ${
                            res.score >= 0.85
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : res.score >= 0.70
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}>
                            {matchPct}% Match
                          </span>

                          {res.chunk_id && (
                            <button
                              onClick={() => {
                                setEditingChunk({
                                  id: res.chunk_id!,
                                  chunkIndex: res.chunk_index ?? 0,
                                  content: res.content,
                                  documentTitle: res.document_title,
                                })
                                setEditingChunkContent(res.content)
                              }}
                              className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all"
                            >
                              <Edit3 className="w-3 h-3 text-indigo-600" /> Edit Chunk
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-gray-700 leading-relaxed font-mono text-[11px] bg-white p-2.5 rounded-lg border border-gray-200 whitespace-pre-wrap">
                        {res.content}
                      </p>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Memory Q&A Studio Chat */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col h-[500px]">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-indigo-600" /> Organizational Q&A Assistant
            </h2>

            <div className="flex-1 overflow-y-auto space-y-3 p-2 bg-gray-50 rounded-xl border border-gray-100 mb-3 text-xs">
              {chatHistory.length === 0 ? (
                <p className="text-center text-gray-400 mt-20">Ask any question about your company policies, pricing, customer terms, or docs...</p>
              ) : (
                chatHistory.map(m => (
                  <div key={m.id} className="space-y-2">
                    <div className="p-2.5 bg-indigo-600 text-white rounded-xl max-w-[80%] ml-auto text-right font-medium">
                      {m.question}
                    </div>
                    <div className="p-3 bg-white border border-gray-200 text-gray-900 rounded-xl max-w-[90%] leading-relaxed space-y-2">
                      <p>{m.answer}</p>
                      {m.sources.length > 0 && (
                        <div className="pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                          Sources: {m.sources.length} matching memory chunks
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleKnowledgeChat() }}
                placeholder="Ask Zuri Memory Engine..."
                className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleKnowledgeChat}
                disabled={chatLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {chatLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* ── MODALS ───────────────────────────────────────────────────────────── */}

      {/* Add Fact Modal */}
      {showFactModal && (
        <ModalWrapper onClose={() => setShowNoteModalFact(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Add Business Fact / Policy Rule</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Category</label>
                <select
                  value={newFactCategory}
                  onChange={e => setNewFactCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[
                    { value: 'pricing', label: 'PRICING' },
                    { value: 'product', label: 'PRODUCTS & SERVICES' },
                    { value: 'refund_policy', label: 'REFUND & RETURN POLICY' },
                    { value: 'business_rule', label: 'BUSINESS RULES & PROCEDURES' },
                    { value: 'shipping', label: 'SHIPPING & DELIVERY' },
                    { value: 'hours', label: 'BUSINESS HOURS' },
                    { value: 'inventory', label: 'INVENTORY' },
                    { value: 'promotion', label: 'PROMOTION' },
                    { value: 'supplier', label: 'SUPPLIER' },
                    { value: 'tax', label: 'TAX' },
                    { value: 'bank_details', label: 'BANK DETAILS' },
                    { value: 'brand_voice', label: 'BRAND VOICE' },
                    { value: 'objection', label: 'OBJECTION HANDLING' },
                    { value: 'faq', label: 'FAQ' },
                    { value: 'other', label: 'GENERAL / OTHER' },
                  ].map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-bold text-gray-700 block mb-1">Fact Key</label>
                <input
                  value={newFactKey}
                  onChange={e => setNewFactKey(e.target.value)}
                  placeholder="e.g. standard_return_policy"
                  className="w-full border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="font-bold text-gray-700 block mb-1">Fact / Policy Value</label>
                <textarea
                  value={newFactValue}
                  onChange={e => setNewFactValue(e.target.value)}
                  rows={4}
                  placeholder="e.g. Clients get 100% refund within 14 days of purchase provided services haven't commenced."
                  className="w-full border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowNoteModalFact(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold">Cancel</button>
              <button onClick={handleCreateFact} disabled={savingFact} className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold">{savingFact ? 'Saving...' : 'Save Fact'}</button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Edit Suggestion Modal */}
      {editingSuggestion && (
        <ModalWrapper onClose={() => setEditingSuggestion(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-sm font-bold text-gray-900">Edit Proposed Fact Before Approval</h2>
            <textarea
              value={editedSuggestionValue}
              onChange={e => setEditedSuggestionValue(e.target.value)}
              rows={5}
              className="w-full border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingSuggestion(null)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold">Cancel</button>
              <button
                onClick={() => handleApproveSuggestion(editingSuggestion.id, editedSuggestionValue)}
                className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold"
              >
                Approve Edited Fact
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Upload Document Modal */}
      {showUploadModal && (
        <ModalWrapper onClose={() => setShowUploadModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-600" /> Upload Document to Knowledge Base
              </h2>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Document Category</label>
                <select
                  value={uploadCategory}
                  onChange={e => setUploadCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {['general', 'pricing', 'catalog', 'faq', 'terms', 'policies', 'manual'].map(c => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Select File (PDF, CSV, TXT, DOCX, Excel)</label>
                <input
                  type="file"
                  onChange={e => setUploadFileObj(e.target.files?.[0] || null)}
                  accept=".pdf,.csv,.txt,.text,.md,.doc,.docx,.xlsx,.xls,image/*"
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                />
              </div>

              {uploadFileObj && (
                <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                  <p className="font-bold text-indigo-900">{uploadFileObj.name}</p>
                  <p className="text-[11px] text-indigo-600">{(uploadFileObj.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setShowUploadModal(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold">Cancel</button>
              <button
                onClick={handleUploadDocument}
                disabled={!uploadFileObj || uploadingFile}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                {uploadingFile ? 'Uploading & Extracting...' : 'Upload & Extract'}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Scrape Web URL Modal */}
      {showUrlModal && (
        <ModalWrapper onClose={() => setShowUrlModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-600" /> Scrape Web Page into Memory
              </h2>
              <button onClick={() => setShowUrlModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-gray-700 block mb-1">Target Web URL</label>
                <input
                  type="url"
                  value={scrapeUrl}
                  onChange={e => setScrapeUrl(e.target.value)}
                  placeholder="https://yourcompany.com/pricing"
                  className="w-full border border-gray-200 rounded-xl p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-bold text-gray-700 block mb-1">Category</label>
                <select
                  value={scrapeCategory}
                  onChange={e => setScrapeCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-2.5 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {['pricing', 'catalog', 'faq', 'policies', 'general'].map(c => (
                    <option key={c} value={c}>{c.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setShowUrlModal(false)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold">Cancel</button>
              <button
                onClick={handleScrapeUrl}
                disabled={!scrapeUrl.trim() || scrapingUrl}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {scrapingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                {scrapingUrl ? 'Crawling...' : 'Crawl Page'}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Edit Vector Chunk Modal */}
      {editingChunk && (
        <ModalWrapper onClose={() => setEditingChunk(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-indigo-600" /> Edit Chunk #{editingChunk.chunkIndex + 1}
                </h2>
                <p className="text-[11px] text-gray-400 truncate max-w-xs">{editingChunk.documentTitle || 'Knowledge Chunk'}</p>
              </div>
              <button onClick={() => setEditingChunk(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between text-[11px] text-gray-500">
                <span>Text Content</span>
                <span>{editingChunkContent.split(/\s+/).filter(Boolean).length} words</span>
              </div>
              <textarea
                value={editingChunkContent}
                onChange={e => setEditingChunkContent(e.target.value)}
                rows={8}
                className="w-full border border-gray-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono leading-relaxed"
                placeholder="Edit the chunk text to correct pricing or policy facts..."
              />
              <p className="text-[11px] text-indigo-600 bg-indigo-50 p-2.5 rounded-xl border border-indigo-100">
                Saving will re-generate the vector embedding via AI models and update pgvector so RAG answers reflect the updated facts immediately.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setEditingChunk(null)} className="px-4 py-2 border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold">
                Cancel
              </button>
              <button
                onClick={handleSaveChunkEdit}
                disabled={savingChunk || !editingChunkContent.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                {savingChunk ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {savingChunk ? 'Re-embedding Vector...' : 'Save & Re-embed Vector'}
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

      {/* Selected Document Details & Vector Chunks Inspector Modal */}
      {selectedDoc && (
        <ModalWrapper onClose={() => setSelectedDoc(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <TypeIcon type={selectedDoc.sourceType} className="w-5 h-5" />
                <div>
                  <h2 className="text-sm font-bold text-gray-900">{selectedDoc.title}</h2>
                  <p className="text-[11px] text-gray-400 capitalize">{selectedDoc.sourceType} • {selectedDoc.category || 'general'} • {selectedDoc.chunkCount} vector chunks</p>
                </div>
              </div>
              <button onClick={() => setSelectedDoc(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" /> Vector Chunks ({docChunks.length})
              </h3>

              {loadingDocChunks ? (
                <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" /> Loading document chunks...
                </div>
              ) : docChunks.length === 0 ? (
                <div className="py-8 text-center text-gray-400 bg-gray-50 rounded-xl">
                  No vector chunks generated for this document yet.
                </div>
              ) : (
                docChunks.map((chunk) => (
                  <div key={chunk.id} className="p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-gray-900 font-mono">Chunk #{chunk.chunkIndex + 1} ({chunk.tokenCount} tokens)</span>
                      <button
                        onClick={() => {
                          setEditingChunk({
                            id: chunk.id,
                            chunkIndex: chunk.chunkIndex,
                            content: chunk.content,
                            documentTitle: selectedDoc.title,
                          })
                          setEditingChunkContent(chunk.content)
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-gray-100 border border-gray-200 text-indigo-600 rounded-lg font-bold flex items-center gap-1 transition-all"
                      >
                        <Edit3 className="w-3 h-3" /> Edit Chunk
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-gray-700 whitespace-pre-wrap bg-white p-2.5 rounded-lg border border-gray-200">
                      {chunk.content}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button onClick={() => setSelectedDoc(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold">
                Close
              </button>
            </div>
          </div>
        </ModalWrapper>
      )}

    </div>
  )
}
