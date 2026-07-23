'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  BookOpen, Sparkles, CheckCircle, AlertCircle, Loader2, Plus,
  FileText, Globe, FileEdit, Search, RefreshCw, Trash2, ShieldCheck,
  Zap, HelpCircle, Layers, Check, X, ArrowRight, Eye, Tag, Send, Table
} from 'lucide-react'
import { apiClient } from '@/lib/api'
import { Button, Badge, Modal, useToast } from '@/components/ui'

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface KnowledgeAnalytics {
  completenessScore: number
  qualityScore: number
  totalFacts: number
  totalDocuments: number
  pendingSuggestions: number
  categoryBreakdown?: Record<string, number>
}

interface KnowledgeSuggestion {
  id: string
  category: string
  title: string
  proposedKey: string | null
  proposedValue: string
  existingValue: string | null
  confidence: number
  sourceType: string
  sourceSnippet: string | null
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

interface KbDocument {
  id: string
  title: string
  sourceType: string
  sourceUrl: string | null
  category: string | null
  tags: string[]
  status: string
  chunkCount: number
  wordCount: number | null
  fileSizeBytes: number | null
  createdAt: string
}

interface SearchResult {
  document_id: string
  document_title: string
  content: string
  score: number
  source_type: string
  category: string
}

const FACT_CATEGORIES = [
  { id: 'pricing', label: 'Pricing & Packages' },
  { id: 'refund_policy', label: 'Refunds & Returns' },
  { id: 'shipping', label: 'Shipping & Delivery' },
  { id: 'faq', label: 'FAQs & Answers' },
  { id: 'hours', label: 'Operating Hours' },
  { id: 'bank_details', label: 'Bank & Payments' },
  { id: 'business_rule', label: 'Business Rules' },
  { id: 'brand_voice', label: 'Brand Voice' },
  { id: 'other', label: 'General Knowledge' },
]

export function KnowledgeModule({ token }: { token: string | undefined }) {
  const { addToast } = useToast()

  const [activeTab, setActiveTab] = useState<'overview' | 'queue' | 'facts' | 'documents' | 'tester'>('overview')
  const [loading, setLoading] = useState(true)

  // Data States
  const [analytics, setAnalytics] = useState<KnowledgeAnalytics | null>(null)
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestion[]>([])
  const [facts, setFacts] = useState<BusinessFact[]>([])
  const [documents, setDocuments] = useState<KbDocument[]>([])

  // Modal States
  const [isFactModalOpen, setIsFactModalOpen] = useState(false)
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false)
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false)

  // Form States
  const [newFactCategory, setNewFactCategory] = useState('pricing')
  const [newFactKey, setNewFactKey] = useState('')
  const [newFactValue, setNewFactValue] = useState('')
  const [savingFact, setSavingFact] = useState(false)

  const [scrapeUrl, setScrapeUrl] = useState('')
  const [scrapeTitle, setScrapeTitle] = useState('')
  const [submittingUrl, setSubmittingUrl] = useState(false)

  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)

  // Tester State
  const [queryInput, setQueryInput] = useState('')
  const [testResults, setTestResults] = useState<SearchResult[]>([])
  const [testingQuery, setTestingQuery] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')

  // ── Load All Knowledge Base Data ──────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [analyticsRes, suggestionsRes, factsRes, docsRes] = await Promise.allSettled([
        apiClient<KnowledgeAnalytics>('/api/knowledge/analytics', { token }),
        apiClient<{ suggestions: KnowledgeSuggestion[] }>('/api/knowledge/suggestions?status=pending', { token }),
        apiClient<{ facts: BusinessFact[] }>('/api/business-facts', { token }),
        apiClient<{ documents: KbDocument[] }>('/api/knowledge/documents', { token }),
      ])

      if (analyticsRes.status === 'fulfilled') setAnalytics(analyticsRes.value)
      if (suggestionsRes.status === 'fulfilled') setSuggestions(suggestionsRes.value.suggestions || [])
      if (factsRes.status === 'fulfilled') setFacts(factsRes.value.facts || [])
      if (docsRes.status === 'fulfilled') setDocuments(docsRes.value.documents || [])
    } catch {
      addToast({ title: 'Error', description: 'Failed to load Knowledge Base details.', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [token, addToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApproveSuggestion = async (id: string) => {
    if (!token) return
    try {
      await apiClient(`/api/knowledge/suggestions/${id}/approve`, { method: 'POST', token })
      addToast({ title: 'Suggestion Approved', description: 'Published into Zuri long-term memory.', variant: 'success' })
      loadData()
    } catch {
      addToast({ title: 'Error', description: 'Could not approve suggestion.', variant: 'error' })
    }
  }

  const handleRejectSuggestion = async (id: string) => {
    if (!token) return
    try {
      await apiClient(`/api/knowledge/suggestions/${id}/reject`, { method: 'POST', token })
      addToast({ title: 'Suggestion Dismissed', description: 'Removed from review queue.', variant: 'info' })
      loadData()
    } catch {
      addToast({ title: 'Error', description: 'Could not reject suggestion.', variant: 'error' })
    }
  }

  const handleCreateFact = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newFactKey.trim() || !newFactValue.trim() || !token) return
    setSavingFact(true)
    try {
      await apiClient('/api/business-facts', {
        method: 'POST',
        token,
        body: JSON.stringify({
          category: newFactCategory,
          factKey: newFactKey.trim(),
          factValue: newFactValue.trim(),
          isApproved: true,
          source: 'manual',
        }),
      })
      addToast({ title: 'Fact Added', description: 'New business rule recorded.', variant: 'success' })
      setIsFactModalOpen(false)
      setNewFactKey('')
      setNewFactValue('')
      loadData()
    } catch {
      addToast({ title: 'Error', description: 'Failed to save business fact.', variant: 'error' })
    } finally {
      setSavingFact(false)
    }
  }

  const handleDeleteFact = async (factId: string) => {
    if (!token) return
    try {
      await apiClient(`/api/business-facts/${factId}`, { method: 'DELETE', token })
      addToast({ title: 'Fact Deleted', description: 'Fact removed from memory.', variant: 'info' })
      loadData()
    } catch {
      addToast({ title: 'Error', description: 'Failed to delete fact.', variant: 'error' })
    }
  }

  const handleScrapeUrl = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!scrapeUrl.trim() || !token) return
    setSubmittingUrl(true)
    try {
      await apiClient('/api/knowledge/scrape', {
        method: 'POST',
        token,
        body: JSON.stringify({ url: scrapeUrl.trim(), title: scrapeTitle.trim() || scrapeUrl.trim() }),
      })
      addToast({ title: 'URL Queued for Indexing', description: 'Zuri is scraping and indexing web content.', variant: 'success' })
      setIsUrlModalOpen(false)
      setScrapeUrl('')
      setScrapeTitle('')
      loadData()
    } catch {
      addToast({ title: 'Error', description: 'Failed to queue URL for scraping.', variant: 'error' })
    } finally {
      setSubmittingUrl(false)
    }
  }

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!noteTitle.trim() || !noteContent.trim() || !token) return
    setSubmittingNote(true)
    try {
      await apiClient('/api/knowledge/documents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          title: noteTitle.trim(),
          rawContent: noteContent.trim(),
          sourceType: 'text',
        }),
      })
      addToast({ title: 'Knowledge Note Created', description: 'Indexed into vector search memory.', variant: 'success' })
      setIsNoteModalOpen(false)
      setNoteTitle('')
      setNoteContent('')
      loadData()
    } catch {
      addToast({ title: 'Error', description: 'Failed to index note.', variant: 'error' })
    } finally {
      setSubmittingNote(false)
    }
  }

  const handleTestQuery = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!queryInput.trim() || !token) return
    setTestingQuery(true)
    try {
      const res = await apiClient<{ results: SearchResult[] }>('/api/knowledge/search', {
        method: 'POST',
        token,
        body: JSON.stringify({ query: queryInput.trim() }),
      })
      setTestResults(res.results || [])
    } catch {
      addToast({ title: 'Query Failed', description: 'Could not perform semantic search test.', variant: 'error' })
    } finally {
      setTestingQuery(false)
    }
  }

  const filteredFacts = categoryFilter === 'all'
    ? facts
    : facts.filter(f => f.category === categoryFilter)

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl p-6 shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-300" />
              <h3 className="text-lg font-bold">Organizational Memory &amp; Knowledge Base</h3>
            </div>
            <p className="text-sm text-indigo-200 max-w-2xl">
              Zuri continuously learns your products, pricing, policies, and SOPs to represent your brand flawlessly over WhatsApp.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="secondary" onClick={() => setIsFactModalOpen(true)} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Plus className="w-4 h-4 mr-1.5" /> Add Fact
            </Button>
            <Button variant="secondary" onClick={() => setIsUrlModalOpen(true)} className="bg-white/10 hover:bg-white/20 text-white border-white/20">
              <Globe className="w-4 h-4 mr-1.5" /> Scrape Web
            </Button>
            <Button onClick={() => setIsNoteModalOpen(true)} className="bg-indigo-500 hover:bg-indigo-600 text-white border-0">
              <FileEdit className="w-4 h-4 mr-1.5" /> Add Note
            </Button>
          </div>
        </div>

        {/* Analytics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-5 border-t border-indigo-700/50">
          <div>
            <span className="text-xs text-indigo-300 block">Memory Completeness</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xl font-bold">{analytics?.completenessScore ?? 85}%</span>
              <div className="w-16 bg-indigo-950 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${analytics?.completenessScore ?? 85}%` }} />
              </div>
            </div>
          </div>
          <div>
            <span className="text-xs text-indigo-300 block">Verified Facts</span>
            <span className="text-xl font-bold mt-1 block">{analytics?.totalFacts ?? facts.length}</span>
          </div>
          <div>
            <span className="text-xs text-indigo-300 block">Indexed Documents</span>
            <span className="text-xl font-bold mt-1 block">{analytics?.totalDocuments ?? documents.length}</span>
          </div>
          <div>
            <span className="text-xs text-indigo-300 block">Pending AI Suggestions</span>
            <span className={`text-xl font-bold mt-1 block ${suggestions.length > 0 ? 'text-amber-300 animate-pulse' : 'text-emerald-300'}`}>
              {suggestions.length}
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'queue' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <span>AI Suggestions Queue</span>
          {suggestions.length > 0 && (
            <span className="bg-amber-400 text-slate-900 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
              {suggestions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('facts')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'facts' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Structured Facts ({facts.length})
        </button>
        <button
          onClick={() => setActiveTab('documents')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'documents' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Indexed Documents ({documents.length})
        </button>
        <button
          onClick={() => setActiveTab('tester')}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap flex items-center gap-1 ${
            activeTab === 'tester' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> AI Retrieval Tester
        </button>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/knowledge-base">
            <span className="text-xs text-indigo-600 font-medium hover:underline flex items-center gap-1">
              Open Knowledge System <ArrowRight className="w-3 h-3" />
            </span>
          </Link>
        </div>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Pending Suggestions Banner */}
          {suggestions.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">
                    {suggestions.length} Knowledge Candidate{suggestions.length !== 1 ? 's' : ''} Awaiting Approval
                  </p>
                  <p className="text-xs text-amber-700">
                    Zuri auto-detected new business facts from customer chats. Review and approve them to expand long-term memory.
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => setActiveTab('queue')} className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                Review Queue
              </Button>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Top Verified Facts Preview */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <h4 className="font-semibold text-gray-900 text-sm">Recent Business Facts</h4>
                </div>
                <button onClick={() => setActiveTab('facts')} className="text-xs text-indigo-600 font-medium hover:underline">
                  View All ({facts.length})
                </button>
              </div>

              {facts.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">No structured facts added yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {facts.slice(0, 4).map(f => (
                    <div key={f.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">
                          {f.category.replace('_', ' ')}
                        </span>
                        <p className="text-xs font-semibold text-gray-900 mt-1">{f.factKey}</p>
                        <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">{f.factValue}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Top Indexed Documents Preview */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-semibold text-gray-900 text-sm">Indexed Documents &amp; Sources</h4>
                </div>
                <button onClick={() => setActiveTab('documents')} className="text-xs text-indigo-600 font-medium hover:underline">
                  View All ({documents.length})
                </button>
              </div>

              {documents.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">No documents or URLs indexed yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {documents.slice(0, 4).map(doc => (
                    <div key={doc.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {doc.sourceType === 'url' ? <Globe className="w-4 h-4 text-blue-500 shrink-0" /> : <FileText className="w-4 h-4 text-indigo-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-gray-900 truncate">{doc.title}</p>
                          <p className="text-[10px] text-gray-400">{doc.chunkCount} vector chunks</p>
                        </div>
                      </div>
                      <Badge variant={doc.status === 'ready' ? 'success' : 'warning'}>{doc.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI SUGGESTIONS QUEUE */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-900">AI-Captured Knowledge Candidates</h4>
            <span className="text-xs text-gray-500">Zuri auto-extracts rules from chats for your review</span>
          </div>

          {suggestions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-2">
              <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-semibold text-gray-900">Queue is Clear</p>
              <p className="text-xs text-gray-500">No pending knowledge suggestions to review.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {suggestions.map(s => (
                <div key={s.id} className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded uppercase">
                        {s.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-semibold text-gray-900">{s.title}</span>
                    </div>
                    <p className="text-xs text-gray-700 bg-gray-50 p-2 rounded-lg border border-gray-100 mt-1 font-mono">
                      {s.proposedValue}
                    </p>
                    {s.sourceSnippet && (
                      <p className="text-[11px] text-gray-400 italic">Source: &quot;{s.sourceSnippet}&quot;</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => handleRejectSuggestion(s.id)} className="text-red-600 hover:bg-red-50">
                      <X className="w-3.5 h-3.5 mr-1" /> Dismiss
                    </Button>
                    <Button size="sm" onClick={() => handleApproveSuggestion(s.id)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve &amp; Publish
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STRUCTURED FACTS */}
      {activeTab === 'facts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg ${
                  categoryFilter === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All Categories
              </button>
              {FACT_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg whitespace-nowrap ${
                    categoryFilter === cat.id ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <Button size="sm" onClick={() => setIsFactModalOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Fact
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredFacts.length === 0 ? (
              <div className="col-span-2 bg-white rounded-2xl border border-gray-200 p-8 text-center">
                <p className="text-xs text-gray-500">No facts found in this category.</p>
              </div>
            ) : (
              filteredFacts.map(f => (
                <div key={f.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-2 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">
                        {f.category.replace('_', ' ')}
                      </span>
                      <button onClick={() => handleDeleteFact(f.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs font-bold text-gray-900 mt-2">{f.factKey}</p>
                    <p className="text-xs text-gray-700 mt-1">{f.factValue}</p>
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                    <span>Source: {f.source}</span>
                    <span className="text-emerald-600 font-semibold">Verified Memory</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: INDEXED DOCUMENTS */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
            <h4 className="text-sm font-bold text-gray-900">Knowledge Documents &amp; Scraped Web Pages</h4>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setIsUrlModalOpen(true)}>
                <Globe className="w-3.5 h-3.5 mr-1" /> Scrape Web URL
              </Button>
              <Button size="sm" onClick={() => setIsNoteModalOpen(true)}>
                <FileEdit className="w-3.5 h-3.5 mr-1" /> Add Note
              </Button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
            {documents.length === 0 ? (
              <p className="p-8 text-center text-xs text-gray-500">No documents indexed yet.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {documents.map(doc => (
                  <div key={doc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-gray-50/80 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      {doc.sourceType === 'url' ? <Globe className="w-5 h-5 text-blue-500 shrink-0" /> : <FileText className="w-5 h-5 text-indigo-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 truncate">{doc.title}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          {doc.sourceType.toUpperCase()} · {doc.chunkCount} chunks
                        </p>
                      </div>
                    </div>
                    <Badge variant={doc.status === 'ready' ? 'success' : 'warning'}>{doc.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AI RETRIEVAL TESTER */}
      {activeTab === 'tester' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4">
            <div>
              <h4 className="text-sm font-bold text-gray-900">AI Knowledge Search &amp; Retrieval Tester</h4>
              <p className="text-xs text-gray-500 mt-0.5">
                Simulate how Zuri searches your knowledge base when answering customer questions.
              </p>
            </div>

            <form onSubmit={handleTestQuery} className="flex gap-2">
              <input
                type="text"
                value={queryInput}
                onChange={e => setQueryInput(e.target.value)}
                placeholder="e.g., What is our return policy? How much is delivery?"
                className="flex-1 text-xs border border-gray-300 rounded-xl px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <Button type="submit" disabled={testingQuery}>
                {testingQuery ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />} Test Search
              </Button>
            </form>
          </div>

          {testResults.length > 0 && (
            <div className="space-y-3">
              <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Retrieval Results</h5>
              {testResults.map((r, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900">{r.document_title}</span>
                    <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded">
                      Score: {(r.score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg border border-gray-100 font-mono text-[11px]">
                    {r.content}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: ADD FACT */}
      {isFactModalOpen && (
        <Modal open={true} title="Add Verified Business Fact" onClose={() => setIsFactModalOpen(false)}>
          <form onSubmit={handleCreateFact} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select
                value={newFactCategory}
                onChange={e => setNewFactCategory(e.target.value)}
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
              >
                {FACT_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Rule / Fact Key</label>
              <input
                type="text"
                value={newFactKey}
                onChange={e => setNewFactKey(e.target.value)}
                placeholder="e.g., Shipping Fee inside Lusaka"
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Fact Value / Policy Details</label>
              <textarea
                value={newFactValue}
                onChange={e => setNewFactValue(e.target.value)}
                placeholder="e.g., Flat rate of K50 for same-day delivery inside Lusaka urban."
                rows={3}
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setIsFactModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingFact}>
                {savingFact ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Fact'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 2: SCRAPE WEB URL */}
      {isUrlModalOpen && (
        <Modal open={true} title="Scrape Web Page into Knowledge Base" onClose={() => setIsUrlModalOpen(false)}>
          <form onSubmit={handleScrapeUrl} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Web Page Title</label>
              <input
                type="text"
                value={scrapeTitle}
                onChange={e => setScrapeTitle(e.target.value)}
                placeholder="e.g., Company Pricing Page"
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Public URL</label>
              <input
                type="url"
                value={scrapeUrl}
                onChange={e => setScrapeUrl(e.target.value)}
                placeholder="https://example.com/pricing"
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setIsUrlModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submittingUrl}>
                {submittingUrl ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start Indexing'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MODAL 3: ADD TEXT NOTE */}
      {isNoteModalOpen && (
        <Modal open={true} title="Add Knowledge Note" onClose={() => setIsNoteModalOpen(false)}>
          <form onSubmit={handleCreateNote} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Note Title</label>
              <input
                type="text"
                value={noteTitle}
                onChange={e => setNoteTitle(e.target.value)}
                placeholder="e.g., Standard Warranty Procedure"
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Raw Content / Note Body</label>
              <textarea
                value={noteContent}
                onChange={e => setNoteContent(e.target.value)}
                placeholder="Paste your procedure, terms, or policy text here..."
                rows={5}
                className="w-full text-xs border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" type="button" onClick={() => setIsNoteModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submittingNote}>
                {submittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Note'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
